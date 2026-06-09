import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiWalletNotFoundError,
  connectAiWallet,
  disconnectAiWallet,
  getAiWalletModels,
  getAiWalletPermissions,
  requestResponseStream
} from "./index";
import type { AiWalletProvider } from "./index";

declare global {
  interface Window {
    aiWallet?: AiWalletProvider;
  }
}

describe("connect-modal SDK", () => {
  beforeEach(() => {
    delete window.aiWallet;
  });

  it("throws a clear error when provider is missing", async () => {
    await expect(
      connectAiWallet({
        models: ["gpt-5.5"],
        reason: "Demo conversation needs AI response access"
      })
    ).rejects.toBeInstanceOf(AiWalletNotFoundError);
  });

  it("delegates connect request to window.aiWallet", async () => {
    const permission = {
      sessionId: "session_123",
      origin: "https://demo.localhost",
      models: ["gpt-5.5"],
      expiresAt: "2099-01-01T00:00:00.000Z"
    };
    const request = vi.fn().mockResolvedValue(permission);
    window.aiWallet = { request };

    await expect(
      connectAiWallet({
        models: ["gpt-5.5"],
        reason: "Demo conversation needs AI response access"
      })
    ).resolves.toEqual(permission);

    expect(request).toHaveBeenCalledWith({
      method: "ai_requestAccounts",
      params: {
        models: ["gpt-5.5"],
        reason: "Demo conversation needs AI response access"
      }
    });
  });

  it("forwards stream request and returns provider result", async () => {
    const request = vi.fn().mockResolvedValue({ streamId: "stream_123" });
    window.aiWallet = { request };

    await expect(
      requestResponseStream({
        sessionId: "session_123",
        model: "gpt-5.5",
        input: "1+2=?"
      })
    ).resolves.toEqual({ streamId: "stream_123" });

    expect(request).toHaveBeenCalledWith({
      method: "ai_requestResponseStream",
      params: {
        sessionId: "session_123",
        model: "gpt-5.5",
        input: "1+2=?"
      }
    });
  });

  it("gets current permissions from window.aiWallet", async () => {
    const permissions = [
      {
        sessionId: "session_123",
        origin: "https://demo.localhost",
        tabId: 7,
        frameId: 0,
        models: ["gpt-5.5"],
        expiresAt: "2099-01-01T00:00:00.000Z"
      }
    ];
    const request = vi.fn().mockResolvedValue({ permissions });
    window.aiWallet = { request };

    await expect(getAiWalletPermissions()).resolves.toEqual(permissions);

    expect(request).toHaveBeenCalledWith({ method: "ai_getPermissions" });
  });

  it("gets available models from window.aiWallet", async () => {
    const request = vi.fn().mockResolvedValue({ models: ["model-a"], source: "discovered" });
    window.aiWallet = { request };

    await expect(getAiWalletModels()).resolves.toEqual({ models: ["model-a"], source: "discovered" });

    expect(request).toHaveBeenCalledWith({ method: "ai_getModels" });
  });

  it("disconnects a session through window.aiWallet", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    window.aiWallet = { request };

    await expect(disconnectAiWallet("session_123")).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith({
      method: "ai_disconnect",
      params: { sessionId: "session_123" }
    });
  });

  it("uses provider stream method with callbacks when available", async () => {
    const request = vi.fn();
    const requestResponseStreamMethod = vi.fn().mockResolvedValue(undefined);
    const onDelta = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();
    window.aiWallet = {
      request,
      requestResponseStream: requestResponseStreamMethod
    };

    await expect(
      requestResponseStream({
        sessionId: "session_123",
        model: "gpt-5.5",
        input: "1+2=?",
        onDelta,
        onError,
        onDone
      })
    ).resolves.toBeUndefined();

    expect(requestResponseStreamMethod).toHaveBeenCalledWith({
      sessionId: "session_123",
      model: "gpt-5.5",
      input: "1+2=?",
      onDelta,
      onError,
      onDone
    });
    expect(request).not.toHaveBeenCalled();
  });
});
