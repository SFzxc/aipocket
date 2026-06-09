export const DEFAULT_AI_SERVICE_ENDPOINT = "https://api.openai.com/v1/responses";

export type ExtensionSettings = {
  openAiApiKey: string;
  aiServiceEndpoint: string;
};

export type SettingsResult = { ok: true; settings: ExtensionSettings } | { ok: false; reason: string };

export function validateEndpointUrl(endpoint: string): { ok: true } | { ok: false; reason: string } {
  try {
    const url = new URL(endpoint);

    if (url.protocol === "https:") {
      return { ok: true };
    }

    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return { ok: true };
    }

    return { ok: false, reason: "Endpoint URL must use HTTPS unless it is localhost" };
  } catch {
    return { ok: false, reason: "Endpoint URL must be valid" };
  }
}

export function resolveResponsesEndpoint(endpointOrBaseUrl: string): string {
  const url = new URL(endpointOrBaseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/responses") ? normalizedPath : `${normalizedPath}/responses`;
  return url.toString();
}

export function resolveModelsEndpoint(endpointOrBaseUrl: string): string {
  const url = new URL(endpointOrBaseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/responses")
    ? `${normalizedPath.slice(0, -"/responses".length)}/models`
    : `${normalizedPath}/models`;
  return url.toString();
}

export function normalizeSettingsInput(input: { openAiApiKey?: string; aiServiceEndpoint?: string }): SettingsResult {
  const openAiApiKey = input.openAiApiKey?.trim() ?? "";
  const aiServiceEndpoint = input.aiServiceEndpoint?.trim() || DEFAULT_AI_SERVICE_ENDPOINT;

  if (!openAiApiKey) {
    return { ok: false, reason: "API key is required" };
  }

  const endpointResult = validateEndpointUrl(aiServiceEndpoint);
  if (!endpointResult.ok) {
    return endpointResult;
  }

  return { ok: true, settings: { openAiApiKey, aiServiceEndpoint } };
}

export function buildEndpointCheckRequest(model: string) {
  return { model, input: "Reply with exactly: pong", stream: false };
}

export function extractModelIds(response: unknown): string[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const value = response as { data?: unknown };
  if (!Array.isArray(value.data)) {
    return [];
  }

  return value.data.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const model = item as { id?: unknown };
    return typeof model.id === "string" && model.id.trim() ? [model.id] : [];
  });
}

export function extractEndpointCheckText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const value = response as { output_text?: unknown; output?: unknown };
  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (!Array.isArray(value.output)) {
    return "";
  }

  return value.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const outputItem = item as { content?: unknown };
      return Array.isArray(outputItem.content) ? outputItem.content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object") {
        return "";
      }

      const contentItem = content as { text?: unknown };
      return typeof contentItem.text === "string" ? contentItem.text : "";
    })
    .join("");
}

export function endpointCheckHasPong(response: unknown): boolean {
  return extractEndpointCheckText(response).trim().toLowerCase().includes("pong");
}
