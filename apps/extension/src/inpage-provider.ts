type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

type PendingStream = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: number;
  resetTimeout: () => void;
  onDelta?: (delta: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
};

type StreamRequest = {
  sessionId: string;
  model: string;
  input: string;
  onDelta?: (delta: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
};

declare global {
  interface Window {
    aiWallet?: {
      request: (request: { method: string; params?: unknown }) => Promise<unknown>;
      requestResponseStream: (request: StreamRequest) => Promise<void>;
    };
  }
}

const pending = new Map<string, PendingRequest>();
const pendingStreams = new Map<string, PendingStream>();
const REQUEST_TIMEOUT_MS = 60_000;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.target !== "ai-wallet-page") {
    return;
  }

  if (event.data.streamId) {
    const stream = pendingStreams.get(event.data.streamId);
    if (!stream) {
      return;
    }

    const payload = event.data.payload;
    if (payload?.type === "delta" && typeof payload.delta === "string") {
      stream.resetTimeout();
      stream.onDelta?.(payload.delta);
      return;
    }

    if (payload?.type === "done") {
      pendingStreams.delete(event.data.streamId);
      clearTimeout(stream.timeoutId);
      stream.onDone?.();
      stream.resolve();
      return;
    }

    if (payload?.type === "error") {
      pendingStreams.delete(event.data.streamId);
      clearTimeout(stream.timeoutId);
      const error = typeof payload.error === "string" ? payload.error : "Stream failed";
      stream.onError?.(error);
      stream.reject(new Error(error));
    }
    return;
  }

  const request = pending.get(event.data.id);
  if (!request) {
    return;
  }

  pending.delete(event.data.id);
  clearTimeout(request.timeoutId);
  if (event.data.payload?.error) {
    request.reject(new Error(String(event.data.payload.error)));
    return;
  }

  request.resolve(event.data.payload);
});

window.aiWallet = {
  request({ method, params }: { method: string; params?: unknown }) {
    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("AI Wallet request timed out"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeoutId });
      window.postMessage(
        {
          target: "ai-wallet-content",
          id,
          payload: { method, params }
        },
        window.location.origin
      );
    });
  },

  requestResponseStream({ sessionId, model, input, onDelta, onError, onDone }: StreamRequest) {
    const streamId = crypto.randomUUID();

    return new Promise<void>((resolve, reject) => {
      let timeoutId = window.setTimeout(() => {
        pendingStreams.delete(streamId);
        reject(new Error("AI Wallet stream timed out"));
      }, REQUEST_TIMEOUT_MS);
      const resetTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          pendingStreams.delete(streamId);
          reject(new Error("AI Wallet stream timed out"));
        }, REQUEST_TIMEOUT_MS);
        const stream = pendingStreams.get(streamId);
        if (stream) {
          stream.timeoutId = timeoutId;
        }
      };
      pendingStreams.set(streamId, { resolve, reject, timeoutId, resetTimeout, onDelta, onError, onDone });
      window.postMessage(
        {
          target: "ai-wallet-content",
          streamId,
          payload: { method: "ai_requestResponseStream", params: { sessionId, model, input } }
        },
        window.location.origin
      );
    });
  }
};

export {};
