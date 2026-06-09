import { validateEndpointUrl } from "@ai-wallet/protocol";

import { streamResponsesApi, type ResponsesApiStreamEvent } from "./openai-compatible-stream";
import { DEFAULT_PROVIDER_ENDPOINTS, type ProviderConfig } from "./providers";
import { extractModelIds, resolveModelsEndpoint, resolveResponsesEndpoint } from "./settings";

export type ProviderStreamEvent = ResponsesApiStreamEvent;
export type ProviderCheckResult =
  | { ok: true; models: string[]; modelSource: "discovered"; modelFetchError: "" }
  | { ok: false; error: string };
export type ProviderStreamRequest = { model: string; input: string };

function parseSseDataBlocks(chunk: string) {
  return chunk
    .split(/(?:\r\n|\n){2,}/)
    .map((block) =>
      block
        .split(/\r\n|\n/)
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n")
    )
    .filter(Boolean);
}

export function parseAnthropicSseChunk(chunk: string): ProviderStreamEvent[] {
  return parseSseDataBlocks(chunk).flatMap((data): ProviderStreamEvent[] => {
    try {
      const parsed = JSON.parse(data) as { type?: unknown; delta?: { text?: unknown } };
      if (parsed.type === "content_block_delta" && typeof parsed.delta?.text === "string") {
        return [{ type: "delta", delta: parsed.delta.text }];
      }
      if (parsed.type === "message_stop") {
        return [{ type: "completed" }];
      }
    } catch {
      return [];
    }
    return [];
  });
}

export function parseOpenAiChatSseChunk(chunk: string): ProviderStreamEvent[] {
  return parseSseDataBlocks(chunk).flatMap((data): ProviderStreamEvent[] => {
    if (data === "[DONE]") {
      return [{ type: "completed" }];
    }

    try {
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
      const content = parsed.choices?.[0]?.delta?.content;
      return typeof content === "string" ? [{ type: "delta", delta: content }] : [];
    } catch {
      return [];
    }
  });
}

export function parseGeminiStreamChunk(chunk: string): ProviderStreamEvent[] {
  try {
    const parsed = JSON.parse(chunk) as Array<{ candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }>;
    const deltas = parsed
      .flatMap((item) => item.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [])
      .flatMap((part) => (typeof part.text === "string" ? [{ type: "delta" as const, delta: part.text }] : []));
    return [...deltas, { type: "completed" }];
  } catch {
    return [];
  }
}

export async function checkProvider(provider: ProviderConfig, fetchImpl: typeof fetch = fetch): Promise<ProviderCheckResult> {
  if (provider.type === "gemini") {
    return { ok: true, models: ["gemini-1.5-flash", "gemini-1.5-pro"], modelSource: "discovered", modelFetchError: "" };
  }

  const endpoint = provider.endpoint ?? DEFAULT_PROVIDER_ENDPOINTS[provider.type];
  if (!endpoint) {
    return { ok: false, error: "Endpoint is required" };
  }

  const modelsUrl = provider.type === "openrouter" ? "https://openrouter.ai/api/v1/models" : resolveModelsEndpoint(endpoint);
  const response = await fetchImpl(modelsUrl, {
    method: "GET",
    headers:
      provider.type === "anthropic-compatible"
        ? { "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${provider.apiKey}` }
  });

  if (!response.ok) {
    return { ok: false, error: `Models check failed with HTTP ${response.status}` };
  }

  const models = extractModelIds(await response.json().catch(() => null));
  if (models.length === 0) {
    return { ok: false, error: "Models endpoint returned no model ids" };
  }

  return { ok: true, models, modelSource: "discovered", modelFetchError: "" };
}

async function streamSse(response: Response, parser: (chunk: string) => ProviderStreamEvent[], onEvent: (event: ProviderStreamEvent) => void) {
  if (!response.ok) {
    throw new Error(`AI service request failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("AI service response body is missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalReceived = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/(?:\r\n|\n){2}/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      for (const event of parser(block)) {
        if (event.type === "completed" || event.type === "error") {
          terminalReceived = true;
        }
        onEvent(event);
      }
    }
  }

  buffer += decoder.decode();
  for (const event of parser(buffer)) {
    if (event.type === "completed" || event.type === "error") {
      terminalReceived = true;
    }
    onEvent(event);
  }

  if (!terminalReceived) {
    throw new Error("AI service stream ended before completion");
  }
}

export async function streamProvider(
  provider: ProviderConfig,
  request: ProviderStreamRequest,
  onEvent: (event: ProviderStreamEvent) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
) {
  const endpoint = provider.endpoint ?? DEFAULT_PROVIDER_ENDPOINTS[provider.type];
  if (!endpoint && provider.type !== "gemini") {
    throw new Error("Endpoint is required");
  }
  if (endpoint) {
    const endpointResult = validateEndpointUrl(endpoint);
    if (!endpointResult.ok) {
      throw new Error(endpointResult.reason);
    }
  }

  if (provider.type === "openai-compatible") {
    await streamResponsesApi({ endpoint: resolveResponsesEndpoint(endpoint ?? ""), apiKey: provider.apiKey, model: request.model, input: request.input, signal, onEvent, fetch: fetchImpl });
    return;
  }

  if (provider.type === "anthropic-compatible") {
    const response = await fetchImpl(endpoint ?? "", {
      method: "POST",
      headers: { "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ model: request.model, max_tokens: 1024, messages: [{ role: "user", content: request.input }], stream: true })
    });
    await streamSse(response, parseAnthropicSseChunk, onEvent);
    return;
  }

  if (provider.type === "openrouter") {
    const response = await fetchImpl(endpoint ?? "", {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ model: request.model, messages: [{ role: "user", content: request.input }], stream: true })
    });
    await streamSse(response, parseOpenAiChatSseChunk, onEvent);
    return;
  }

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?key=${encodeURIComponent(provider.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: request.input }] }] })
    }
  );
  if (!response.ok) {
    throw new Error(`AI service request failed: ${response.status} ${response.statusText}`);
  }
  onEvent({ type: "delta", delta: await response.text() });
  onEvent({ type: "completed" });
}
