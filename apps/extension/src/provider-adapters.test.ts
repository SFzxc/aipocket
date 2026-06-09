import { describe, expect, test, vi } from "vitest";

import { checkProvider, parseAnthropicSseChunk, parseGeminiStreamChunk, streamProvider } from "./provider-adapters";
import type { ProviderConfig } from "./providers";

function streamFromText(text: string) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

describe("provider adapters", () => {
  test("parses Anthropic text deltas", () => {
    const chunk = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"3"}}',
      'event: message_stop\ndata: {"type":"message_stop"}'
    ].join("\n\n");

    expect(parseAnthropicSseChunk(chunk)).toEqual([{ type: "delta", delta: "3" }, { type: "completed" }]);
  });

  test("parses Gemini streamed text", () => {
    expect(parseGeminiStreamChunk('[{"candidates":[{"content":{"parts":[{"text":"3"}]}}]}]')).toEqual([
      { type: "delta", delta: "3" },
      { type: "completed" }
    ]);
  });

  test("checks OpenRouter with chat completions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: [{ id: "openai/gpt-4o-mini" }] }) });
    const provider: ProviderConfig = {
      id: "provider_openrouter",
      type: "openrouter",
      name: "OpenRouter",
      apiKey: "sk-or-test",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      models: [],
      enabled: true
    };

    await expect(checkProvider(provider, fetchMock as typeof fetch)).resolves.toEqual({
      ok: true,
      models: ["openai/gpt-4o-mini"],
      modelSource: "discovered",
      modelFetchError: ""
    });
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", expect.objectContaining({ method: "GET" }));
  });

  test("streams Anthropic request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromText(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"3"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
      )
    });
    const events: unknown[] = [];

    await streamProvider(
      {
        id: "provider_anthropic",
        type: "anthropic-compatible",
        name: "Anthropic",
        apiKey: "sk-ant-test",
        endpoint: "https://api.anthropic.com/v1/messages",
        models: ["claude-3-5-sonnet-latest"],
        enabled: true
      },
      { model: "claude-3-5-sonnet-latest", input: "1+2=?" },
      (event) => events.push(event),
      undefined,
      fetchMock as typeof fetch
    );

    expect(fetchMock).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ method: "POST" }));
    expect(events).toEqual([{ type: "delta", delta: "3" }, { type: "completed" }]);
  });
});
