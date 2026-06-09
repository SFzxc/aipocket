import { describe, expect, test, vi } from "vitest";

import { parseResponsesApiSseChunk, streamResponsesApi } from "./openai-compatible-stream";

function streamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}

describe("OpenAI-compatible Responses API stream", () => {
  test("parses delta, completed, and error SSE events", () => {
    const chunk = [
      'event: response.output_text.delta\ndata: {"delta":"3"}',
      'event: response.completed\ndata: {}',
      'event: response.error\ndata: {"message":"boom"}'
    ].join("\n\n");

    expect(parseResponsesApiSseChunk(chunk)).toEqual([
      { type: "delta", delta: "3" },
      { type: "completed" },
      { type: "error", message: "boom" }
    ]);
  });

  test("ignores DONE, unknown events, and malformed JSON", () => {
    const chunk = [
      "event: response.output_text.delta\ndata: [DONE]",
      'event: other.event\ndata: {"delta":"ignored"}',
      "event: response.output_text.delta\ndata: not-json"
    ].join("\n\n");

    expect(parseResponsesApiSseChunk(chunk)).toEqual([]);
  });

  test("parses CRLF-delimited events with type in data", () => {
    const chunk =
      'data: {"type":"response.output_text.delta","delta":"a"}\r\n\r\ndata: {"type":"response.output_text.delta","delta":"b"}\r\n\r\n';

    expect(parseResponsesApiSseChunk(chunk)).toEqual([
      { type: "delta", delta: "a" },
      { type: "delta", delta: "b" }
    ]);
  });

  test("streams request and buffers partial SSE events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromChunks([
        'event: response.output_text.delta\ndata: {"delta":"',
        '3"}\n\nevent: response.completed\ndata: {}\n\n'
      ])
    });
    const events: unknown[] = [];

    await streamResponsesApi({
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "sk-test",
      model: "gpt-5.5",
      input: "1+2=?",
      fetch: fetchMock,
      onEvent: (event) => events.push(event)
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-test",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-5.5", input: "1+2=?", stream: true })
    });
    expect(events).toEqual([{ type: "delta", delta: "3" }, { type: "completed" }]);
  });

  test("throws on non-ok response or missing body", async () => {
    await expect(
      streamResponsesApi({
        endpoint: "https://api.openai.com/v1/responses",
        apiKey: "sk-test",
        model: "gpt-5.5",
        input: "1+2=?",
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized", body: streamFromChunks([]) }),
        onEvent: () => undefined
      })
    ).rejects.toThrow("AI service request failed: 401 Unauthorized");

    await expect(
      streamResponsesApi({
        endpoint: "https://api.openai.com/v1/responses",
        apiKey: "sk-test",
        model: "gpt-5.5",
        input: "1+2=?",
        fetch: vi.fn().mockResolvedValue({ ok: true, body: null }),
        onEvent: () => undefined
      })
    ).rejects.toThrow("AI service response body is missing");
  });

  test("throws when stream ends without completed or error event", async () => {
    const events: unknown[] = [];

    await expect(
      streamResponsesApi({
        endpoint: "https://api.openai.com/v1/responses",
        apiKey: "sk-test",
        model: "gpt-5.5",
        input: "1+2=?",
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          body: streamFromChunks(['event: response.output_text.delta\ndata: {"delta":"3"}\n\n'])
        }),
        onEvent: (event) => events.push(event)
      })
    ).rejects.toThrow("AI service stream ended before completion");
    expect(events).toEqual([{ type: "delta", delta: "3" }]);
  });
});
