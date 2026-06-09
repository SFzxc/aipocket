import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SERVICE_ENDPOINT,
  SUPPORTED_MODELS,
  validateEndpointUrl,
  validateStreamPermission,
  type AiWalletPermission
} from "./index";

describe("protocol", () => {
  const activePermission: AiWalletPermission = {
    sessionId: "session_123",
    origin: "https://demo.localhost",
    tabId: 7,
    frameId: 0,
    providerId: "provider_openai",
    models: ["gpt-4.1-mini"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    requestCount: 0
  };

  it("defines supported MVP stream-capable model", () => {
    expect(SUPPORTED_MODELS).toEqual(["gpt-5.5", "gpt-4.1-mini", "gpt-4.1", "o4-mini"]);
  });

  it("defines default OpenAI Responses endpoint", () => {
    expect(DEFAULT_AI_SERVICE_ENDPOINT).toBe("https://api.openai.com/v1/responses");
  });

  it("allows stream when session, origin, tab, frame, model, and expiry match", () => {
    expect(
      validateStreamPermission(activePermission, {
        sessionId: "session_123",
        origin: "https://demo.localhost",
        tabId: 7,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toEqual({ ok: true });
  });

  it("rejects mismatched session", () => {
    expect(
      validateStreamPermission(activePermission, {
        sessionId: "session_456",
        origin: "https://demo.localhost",
        tabId: 7,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toEqual({ ok: false, reason: "Session does not match permission" });
  });

  it("rejects mismatched origin", () => {
    expect(
      validateStreamPermission(activePermission, {
        sessionId: "session_123",
        origin: "https://evil.localhost",
        tabId: 7,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toEqual({ ok: false, reason: "Origin does not match permission" });
  });

  it("rejects mismatched tab", () => {
    expect(
      validateStreamPermission(activePermission, {
        sessionId: "session_123",
        origin: "https://demo.localhost",
        tabId: 8,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toEqual({ ok: false, reason: "Tab does not match permission" });
  });

  it("rejects mismatched frame", () => {
    expect(
      validateStreamPermission(activePermission, {
        sessionId: "session_123",
        origin: "https://demo.localhost",
        tabId: 7,
        frameId: 1,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toEqual({ ok: false, reason: "Frame does not match permission" });
  });

  it("rejects expired permission", () => {
    expect(
      validateStreamPermission(
        { ...activePermission, expiresAt: "2026-06-07T00:00:00.000Z" },
        {
          sessionId: "session_123",
          origin: "https://demo.localhost",
          tabId: 7,
          frameId: 0,
          providerId: "provider_openai",
          model: "gpt-4.1-mini",
          now: new Date("2026-06-07T00:00:01.000Z")
        }
      )
    ).toEqual({ ok: false, reason: "Permission expired" });
  });

  it("rejects permission with invalid expiry", () => {
    expect(
      validateStreamPermission(
        { ...activePermission, expiresAt: "not-a-date" },
        {
          sessionId: "session_123",
          origin: "https://demo.localhost",
          tabId: 7,
          frameId: 0,
          providerId: "provider_openai",
          model: "gpt-4.1-mini",
          now: new Date("2026-06-07T00:00:00.000Z")
        }
      )
    ).toEqual({ ok: false, reason: "Permission expired" });
  });

  it("rejects unapproved model", () => {
    expect(
      validateStreamPermission(activePermission, {
        sessionId: "session_123",
        origin: "https://demo.localhost",
        tabId: 7,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-5",
        now: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toEqual({ ok: false, reason: "Model is not approved for this session" });
  });

  it("allows stream only when provider id matches", () => {
    expect(
      validateStreamPermission(
        { ...activePermission, providerId: "provider_openai", requestLimit: 2, requestCount: 0 },
        {
          sessionId: "session_123",
          origin: "https://demo.localhost",
          tabId: 7,
          frameId: 0,
          providerId: "provider_openai",
          model: "gpt-4.1-mini",
          now: new Date("2026-06-07T00:00:00.000Z")
        }
      )
    ).toEqual({ ok: true });
  });

  it("rejects mismatched provider id", () => {
    expect(
      validateStreamPermission(
        { ...activePermission, providerId: "provider_openai", requestLimit: 2, requestCount: 0 },
        {
          sessionId: "session_123",
          origin: "https://demo.localhost",
          tabId: 7,
          frameId: 0,
          providerId: "provider_anthropic",
          model: "gpt-4.1-mini",
          now: new Date("2026-06-07T00:00:00.000Z")
        }
      )
    ).toEqual({ ok: false, reason: "Provider does not match permission" });
  });

  it("rejects stream when request limit is reached", () => {
    expect(
      validateStreamPermission(
        { ...activePermission, providerId: "provider_openai", requestLimit: 2, requestCount: 2 },
        {
          sessionId: "session_123",
          origin: "https://demo.localhost",
          tabId: 7,
          frameId: 0,
          providerId: "provider_openai",
          model: "gpt-4.1-mini",
          now: new Date("2026-06-07T00:00:00.000Z")
        }
      )
    ).toEqual({ ok: false, reason: "Request limit reached" });
  });

  it("accepts HTTPS endpoint URLs", () => {
    expect(validateEndpointUrl("https://proxy.example.com/v1/responses")).toEqual({ ok: true });
  });

  it("rejects invalid endpoint URLs", () => {
    expect(validateEndpointUrl("not a url")).toEqual({
      ok: false,
      reason: "Endpoint must be a valid URL"
    });
  });

  it("rejects non-HTTPS endpoint URLs", () => {
    expect(validateEndpointUrl("http://proxy.example.com/v1/responses")).toEqual({
      ok: false,
      reason: "Endpoint must use HTTPS unless it is localhost"
    });
  });

  it("accepts HTTP localhost endpoint URLs", () => {
    expect(validateEndpointUrl("http://localhost:8080/v1")).toEqual({ ok: true });
    expect(validateEndpointUrl("http://127.0.0.1:8080/v1")).toEqual({ ok: true });
  });
});
