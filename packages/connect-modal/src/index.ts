export class AiWalletNotFoundError extends Error {
  constructor() {
    super("window.aiWallet provider was not found");
    this.name = "AiWalletNotFoundError";
  }
}

export type AiWalletProvider = {
  request: (request: { method: string; params?: unknown }) => Promise<unknown>;
  requestResponseStream?: (request: StreamRequest) => Promise<void>;
};

export type ConnectRequest = {
  providerId: string;
  models: string[];
  reason: string;
};

export type AiWalletPermission = {
  sessionId: string;
  origin: string;
  tabId: number;
  frameId: number;
  providerId: string;
  models: string[];
  expiresAt: string;
  requestLimit?: number;
  requestCount: number;
};

export type AiWalletModelsResult = {
  models: string[];
  source: "discovered" | "fallback";
};

export type StreamRequest = {
  sessionId: string;
  providerId: string;
  model: string;
  input: string;
  onDelta?: (delta: string) => void;
  onError?: (error: unknown) => void;
  onDone?: () => void;
};

declare global {
  interface Window {
    aiWallet?: AiWalletProvider;
  }
}

function getProvider(): AiWalletProvider {
  if (!window.aiWallet) {
    throw new AiWalletNotFoundError();
  }

  return window.aiWallet;
}

export async function connectAiWallet(request: ConnectRequest): Promise<AiWalletPermission> {
  return getProvider().request({
    method: "ai_requestAccounts",
    params: request
  }) as Promise<AiWalletPermission>;
}

export async function getAiWalletPermissions(): Promise<AiWalletPermission[]> {
  const response = await getProvider().request({ method: "ai_getPermissions" });
  return ((response as { permissions?: AiWalletPermission[] })?.permissions ?? []);
}

export async function getAiWalletModels(): Promise<AiWalletModelsResult> {
  return getProvider().request({ method: "ai_getModels" }) as Promise<AiWalletModelsResult>;
}

export async function disconnectAiWallet(sessionId: string): Promise<unknown> {
  return getProvider().request({
    method: "ai_disconnect",
    params: { sessionId }
  });
}

export async function requestResponseStream(request: StreamRequest): Promise<unknown> {
  const provider = getProvider();

  if (provider.requestResponseStream) {
    return provider.requestResponseStream(request);
  }

  const { sessionId, providerId, model, input } = request;
  return provider.request({
    method: "ai_requestResponseStream",
    params: { sessionId, providerId, model, input }
  });
}
