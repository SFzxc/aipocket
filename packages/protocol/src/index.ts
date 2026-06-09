export const SUPPORTED_MODELS = ["gpt-5.5", "gpt-4.1-mini", "gpt-4.1", "o4-mini"] as const;

export const DEFAULT_AI_SERVICE_ENDPOINT = "https://api.openai.com/v1/responses";

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export type ProviderType = "openai-compatible" | "anthropic-compatible" | "openrouter" | "gemini";

export type AiWalletMethod =
  | "ai_requestAccounts"
  | "ai_getPermissions"
  | "ai_getModels"
  | "ai_requestResponseStream"
  | "ai_disconnect";

export type AiWalletModelsResult = {
  models: string[];
  source: "discovered" | "fallback";
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

export type StreamPermissionInput = {
  sessionId: string;
  origin: string;
  tabId: number;
  frameId: number;
  providerId: string;
  model: string;
  now?: Date;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateEndpointUrl(endpoint: string): ValidationResult {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, reason: "Endpoint must be a valid URL" };
  }

  if (url.protocol === "https:") {
    return { ok: true };
  }

  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return { ok: true };
  }

  return { ok: false, reason: "Endpoint must use HTTPS unless it is localhost" };
}

export function validateStreamPermission(
  permission: AiWalletPermission,
  input: StreamPermissionInput
): ValidationResult {
  if (permission.sessionId !== input.sessionId) {
    return { ok: false, reason: "Session does not match permission" };
  }

  if (permission.origin !== input.origin) {
    return { ok: false, reason: "Origin does not match permission" };
  }

  if (permission.tabId !== input.tabId) {
    return { ok: false, reason: "Tab does not match permission" };
  }

  if (permission.frameId !== input.frameId) {
    return { ok: false, reason: "Frame does not match permission" };
  }

  if (permission.providerId !== input.providerId) {
    return { ok: false, reason: "Provider does not match permission" };
  }

  const now = input.now ?? new Date();
  const expiryTime = new Date(permission.expiresAt).getTime();
  if (!Number.isFinite(expiryTime) || expiryTime <= now.getTime()) {
    return { ok: false, reason: "Permission expired" };
  }

  if (!permission.models.includes(input.model)) {
    return { ok: false, reason: "Model is not approved for this session" };
  }

  if (permission.requestLimit !== undefined && permission.requestCount >= permission.requestLimit) {
    return { ok: false, reason: "Request limit reached" };
  }

  return { ok: true };
}
