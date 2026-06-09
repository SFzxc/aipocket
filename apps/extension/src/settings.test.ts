import { describe, expect, test } from "vitest";

import {
  DEFAULT_AI_SERVICE_ENDPOINT,
  buildEndpointCheckRequest,
  endpointCheckHasPong,
  extractEndpointCheckText,
  extractModelIds,
  normalizeSettingsInput,
  resolveModelsEndpoint,
  resolveResponsesEndpoint,
  validateEndpointUrl
} from "./settings";

describe("settings", () => {
  test("normalizes trimmed API key and default endpoint", () => {
    expect(normalizeSettingsInput({ openAiApiKey: " sk-test ", aiServiceEndpoint: " " })).toEqual({
      ok: true,
      settings: {
        openAiApiKey: "sk-test",
        aiServiceEndpoint: DEFAULT_AI_SERVICE_ENDPOINT
      }
    });
  });

  test("normalizes trimmed custom HTTPS endpoint", () => {
    expect(
      normalizeSettingsInput({
        openAiApiKey: " sk-test ",
        aiServiceEndpoint: " https://proxy.example.test/v1/responses "
      })
    ).toEqual({
      ok: true,
      settings: {
        openAiApiKey: "sk-test",
        aiServiceEndpoint: "https://proxy.example.test/v1/responses"
      }
    });
  });

  test("rejects empty API key", () => {
    expect(normalizeSettingsInput({ openAiApiKey: " ", aiServiceEndpoint: DEFAULT_AI_SERVICE_ENDPOINT })).toEqual({
      ok: false,
      reason: "API key is required"
    });
  });

  test("rejects non-HTTPS endpoint", () => {
    expect(validateEndpointUrl("http://example.test/v1/responses")).toEqual({
      ok: false,
      reason: "Endpoint URL must use HTTPS unless it is localhost"
    });
  });

  test("allows HTTP localhost endpoints for local development", () => {
    expect(validateEndpointUrl("http://localhost:8080/v1")).toEqual({ ok: true });
    expect(validateEndpointUrl("http://127.0.0.1:8080/v1")).toEqual({ ok: true });
  });

  test("builds endpoint check request with selected model", () => {
    expect(buildEndpointCheckRequest("custom-model")).toEqual({
      model: "custom-model",
      input: "Reply with exactly: pong",
      stream: false
    });
  });

  test("extracts model ids from OpenAI-compatible models response", () => {
    expect(
      extractModelIds({
        data: [{ id: "gpt-5.5" }, { id: "gpt-4.1-mini" }, { id: 5 }, null, { object: "model" }]
      })
    ).toEqual(["gpt-5.5", "gpt-4.1-mini"]);
  });

  test("returns empty model ids for invalid models response", () => {
    expect(extractModelIds(null)).toEqual([]);
    expect(extractModelIds({ data: {} })).toEqual([]);
    expect(extractModelIds({ data: [{ id: 5 }] })).toEqual([]);
  });

  test("extracts endpoint check text from output_text", () => {
    expect(extractEndpointCheckText({ output_text: "pong" })).toBe("pong");
  });

  test("extracts endpoint check text from output content", () => {
    expect(extractEndpointCheckText({ output: [{ content: [{ text: "pong" }] }] })).toBe("pong");
  });

  test("detects pong endpoint responses", () => {
    expect(endpointCheckHasPong({ output_text: "pong" })).toBe(true);
    expect(endpointCheckHasPong({ output_text: "hello" })).toBe(false);
  });

  test("resolves base URLs to Responses API endpoints", () => {
    expect(resolveResponsesEndpoint("https://proxy.example/openai")).toBe("https://proxy.example/openai/responses");
    expect(resolveResponsesEndpoint("https://proxy.example/openai/")).toBe("https://proxy.example/openai/responses");
    expect(resolveResponsesEndpoint("https://proxy.example/openai/responses")).toBe("https://proxy.example/openai/responses");
  });

  test("resolves models endpoint beside responses endpoint", () => {
    expect(resolveModelsEndpoint("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/models");
    expect(resolveModelsEndpoint("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/models");
    expect(resolveModelsEndpoint("https://api.openai.com/v1/responses")).toBe("https://api.openai.com/v1/models");
    expect(resolveModelsEndpoint("https://proxy.example/openai")).toBe("https://proxy.example/openai/models");
    expect(resolveModelsEndpoint("https://proxy.example/openai/responses")).toBe("https://proxy.example/openai/models");
    expect(resolveModelsEndpoint("http://localhost:8787/openai")).toBe("http://localhost:8787/openai/models");
  });
});
