export type ResponsesApiStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "completed" }
  | { type: "error"; message: string };

export type StreamResponsesApiOptions = {
  endpoint: string;
  apiKey: string;
  model: string;
  input: string;
  signal?: AbortSignal;
  onEvent: (event: ResponsesApiStreamEvent) => void;
  fetch?: typeof fetch;
};

export function parseResponsesApiSseChunk(chunk: string): ResponsesApiStreamEvent[] {
  const events: ResponsesApiStreamEvent[] = [];

  for (const block of chunk.split(/(?:\r\n|\n){2,}/)) {
    const lines = block.split(/\r\n|\n/);
    const data = lines
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice("data: ".length))
      .join("\n");

    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as { type?: unknown; delta?: unknown; message?: unknown };
      const eventName =
        lines.find((line) => line.startsWith("event: "))?.slice("event: ".length).trim() ??
        (typeof parsed.type === "string" ? parsed.type : undefined);

      if (!eventName) {
        continue;
      }

      if (eventName === "response.output_text.delta" && typeof parsed.delta === "string") {
        events.push({ type: "delta", delta: parsed.delta });
      } else if (eventName === "response.completed") {
        events.push({ type: "completed" });
      } else if (eventName === "response.error") {
        events.push({ type: "error", message: typeof parsed.message === "string" ? parsed.message : "AI service error" });
      }
    } catch {
      continue;
    }
  }

  return events;
}

export async function streamResponsesApi(options: StreamResponsesApiOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    },
    signal: options.signal,
    body: JSON.stringify({ model: options.model, input: options.input, stream: true })
  });

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

  const emit = (event: ResponsesApiStreamEvent) => {
    if (event.type === "completed" || event.type === "error") {
      terminalReceived = true;
    }

    options.onEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/(?:\r\n|\n){2}/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      for (const event of parseResponsesApiSseChunk(block)) {
        emit(event);
      }
    }
  }

  buffer += decoder.decode();
  for (const event of parseResponsesApiSseChunk(buffer)) {
    emit(event);
  }

  if (!terminalReceived) {
    throw new Error("AI service stream ended before completion");
  }
}
