import { validateEndpointUrl, type ProviderType } from "@ai-wallet/protocol";

export type { ProviderType };

export type ProviderConfig = {
  id: string;
  type: ProviderType;
  name: string;
  apiKey: string;
  endpoint?: string;
  models: string[];
  enabled: boolean;
  requestLimit?: number;
};

export type ProviderInput = {
  id?: string;
  type: ProviderType;
  name: string;
  apiKey: string;
  endpoint?: string;
  requestLimit?: string;
};

export const PROVIDERS_STORAGE_KEY = "aiWalletProviders";

export const DEFAULT_PROVIDER_ENDPOINTS: Record<ProviderType, string | undefined> = {
  "openai-compatible": "https://api.openai.com/v1/responses",
  "anthropic-compatible": "https://api.anthropic.com/v1/messages",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  gemini: undefined
};

export function getProviderTypeLabel(type: ProviderType) {
  return {
    "openai-compatible": "OpenAI-compatible",
    "anthropic-compatible": "Anthropic-compatible",
    openrouter: "OpenRouter",
    gemini: "Gemini"
  }[type];
}

function isProviderType(value: unknown): value is ProviderType {
  return value === "openai-compatible" || value === "anthropic-compatible" || value === "openrouter" || value === "gemini";
}

export function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const provider = value as ProviderConfig;
  return (
    typeof provider.id === "string" &&
    isProviderType(provider.type) &&
    typeof provider.name === "string" &&
    typeof provider.apiKey === "string" &&
    (provider.endpoint === undefined || typeof provider.endpoint === "string") &&
    Array.isArray(provider.models) &&
    provider.models.every((model) => typeof model === "string") &&
    typeof provider.enabled === "boolean" &&
    (provider.requestLimit === undefined || (Number.isInteger(provider.requestLimit) && provider.requestLimit >= 1))
  );
}

export function normalizeProviderInput(input: ProviderInput): { ok: true; provider: ProviderConfig } | { ok: false; error: string } {
  const name = input.name.trim() || getProviderTypeLabel(input.type);
  const apiKey = input.apiKey.trim();
  const endpoint = input.endpoint?.trim() || DEFAULT_PROVIDER_ENDPOINTS[input.type];

  if (!apiKey) {
    return { ok: false, error: "API key is required" };
  }

  if (endpoint) {
    const endpointResult = validateEndpointUrl(endpoint);
    if (!endpointResult.ok) {
      return { ok: false, error: endpointResult.reason };
    }
  }

  const requestLimitText = input.requestLimit?.trim() ?? "";
  const requestLimit = requestLimitText ? Number(requestLimitText) : undefined;
  if (requestLimit !== undefined && (!Number.isInteger(requestLimit) || requestLimit < 1)) {
    return { ok: false, error: "Request limit must be at least 1" };
  }

  return {
    ok: true,
    provider: {
      id: input.id ?? `provider_${crypto.randomUUID()}`,
      type: input.type,
      name,
      apiKey,
      endpoint,
      models: [],
      enabled: true,
      requestLimit
    }
  };
}

export function migrateStoredProviders(stored: Record<string, unknown>): ProviderConfig[] {
  const providers = stored[PROVIDERS_STORAGE_KEY];
  if (Array.isArray(providers)) {
    return providers.filter(isProviderConfig);
  }

  if (typeof stored.openAiApiKey !== "string" || !stored.openAiApiKey) {
    return [];
  }

  return [
    {
      id: "provider_openai",
      type: "openai-compatible",
      name: "OpenAI-compatible",
      apiKey: stored.openAiApiKey,
      endpoint: typeof stored.aiServiceEndpoint === "string" ? stored.aiServiceEndpoint : DEFAULT_PROVIDER_ENDPOINTS["openai-compatible"],
      models: Array.isArray(stored.aiWalletAvailableModels)
        ? stored.aiWalletAvailableModels.filter((model): model is string => typeof model === "string")
        : [],
      enabled: true
    }
  ];
}
