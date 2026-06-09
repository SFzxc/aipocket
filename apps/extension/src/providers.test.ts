import { describe, expect, test } from "vitest";

import {
  DEFAULT_PROVIDER_ENDPOINTS,
  getProviderTypeLabel,
  migrateStoredProviders,
  normalizeProviderInput,
  type ProviderConfig
} from "./providers";

describe("providers", () => {
  test("labels provider types", () => {
    expect(getProviderTypeLabel("openai-compatible")).toBe("OpenAI-compatible");
    expect(getProviderTypeLabel("anthropic-compatible")).toBe("Anthropic-compatible");
    expect(getProviderTypeLabel("openrouter")).toBe("OpenRouter");
    expect(getProviderTypeLabel("gemini")).toBe("Gemini");
  });

  test("normalizes provider input with defaults", () => {
    expect(
      normalizeProviderInput({
        type: "openrouter",
        name: " OpenRouter ",
        apiKey: " sk-or-test ",
        endpoint: "",
        requestLimit: "5"
      })
    ).toEqual({
      ok: true,
      provider: {
        id: expect.stringMatching(/^provider_[0-9a-f-]{36}$/),
        type: "openrouter",
        name: "OpenRouter",
        apiKey: "sk-or-test",
        endpoint: DEFAULT_PROVIDER_ENDPOINTS.openrouter,
        models: [],
        enabled: true,
        requestLimit: 5
      }
    });
  });

  test("rejects missing key and invalid limit", () => {
    expect(normalizeProviderInput({ type: "gemini", name: "Gemini", apiKey: "", requestLimit: "" })).toEqual({
      ok: false,
      error: "API key is required"
    });
    expect(normalizeProviderInput({ type: "gemini", name: "Gemini", apiKey: "key", requestLimit: "0" })).toEqual({
      ok: false,
      error: "Request limit must be at least 1"
    });
  });

  test("migrates old OpenAI settings when provider list is absent", () => {
    const providers = migrateStoredProviders({
      openAiApiKey: "sk-test",
      aiServiceEndpoint: "https://proxy.example/v1",
      aiWalletAvailableModels: ["gpt-4.1-mini"]
    });

    expect(providers).toEqual([
      {
        id: "provider_openai",
        type: "openai-compatible",
        name: "OpenAI-compatible",
        apiKey: "sk-test",
        endpoint: "https://proxy.example/v1",
        models: ["gpt-4.1-mini"],
        enabled: true
      }
    ]);
  });

  test("keeps valid stored providers", () => {
    const stored: ProviderConfig = {
      id: "provider_existing",
      type: "gemini",
      name: "Gemini",
      apiKey: "key",
      models: ["gemini-1.5-flash"],
      enabled: true,
      requestLimit: 3
    };

    expect(migrateStoredProviders({ aiWalletProviders: [stored] })).toEqual([stored]);
  });
});
