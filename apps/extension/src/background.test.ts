import { beforeEach, describe, expect, test, vi } from "vitest";

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | undefined;

type ConnectListener = (port: chrome.runtime.Port) => void;
type TabRemovedListener = (tabId: number) => void;
type WindowRemovedListener = (windowId: number) => void;

function createPort(sender: chrome.runtime.MessageSender) {
  let messageListener: (message: unknown) => void = () => undefined;
  let disconnectListener: () => void = () => undefined;
  return {
    name: "ai-wallet-stream",
    sender,
    postMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn((callback: (message: unknown) => void) => {
        messageListener = callback;
      })
    },
    onDisconnect: {
      addListener: vi.fn((callback: () => void) => {
        disconnectListener = callback;
      })
    },
    emitMessage(message: unknown) {
      messageListener(message);
    },
    emitDisconnect() {
      disconnectListener();
    }
  };
}

describe("background approval flow", () => {
  let listener: MessageListener;
  let connectListener: ConnectListener;
  let tabRemovedListener: TabRemovedListener;
  let windowRemovedListener: WindowRemovedListener;
  let windowsCreate: ReturnType<typeof vi.fn>;
  let storageGet: ReturnType<typeof vi.fn>;
  let storageSet: ReturnType<typeof vi.fn>;
  let streamResponsesApi: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const approvalPageSender = { url: "chrome-extension://wallet/src/approval.html" };
  const popupPageSender = { url: "chrome-extension://wallet/src/popup.html" };
  const pageSender = { origin: "https://demo.localhost", tab: { id: 7 } as chrome.tabs.Tab, frameId: 2 };

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));

    windowsCreate = vi.fn().mockResolvedValue({ id: 1 });
    storageGet = vi.fn().mockResolvedValue({
      openAiApiKey: "sk-test",
      aiServiceEndpoint: "https://api.openai.com/v1/responses",
      aiWalletSessions: []
    });
    storageSet = vi.fn().mockResolvedValue(undefined);
    streamResponsesApi = vi.fn().mockImplementation(async ({ onEvent }) => {
      onEvent({ type: "delta", delta: "3" });
      onEvent({ type: "completed" });
    });
    fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: vi.fn().mockResolvedValue(url.endsWith("/models") ? { data: [{ id: "gpt-5.5" }] } : { output_text: "pong" })
    }));

    vi.doMock("./openai-compatible-stream", () => ({ streamResponsesApi }));
    vi.stubGlobal("fetch", fetchMock);

    vi.stubGlobal("chrome", {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://wallet/${path}`),
        onMessage: {
          addListener: vi.fn((callback: MessageListener) => {
            listener = callback;
          })
        },
        onConnect: {
          addListener: vi.fn((callback: ConnectListener) => {
            connectListener = callback;
          })
        }
      },
      storage: {
        local: {
          get: storageGet,
          set: storageSet
        }
      },
      tabs: {
        onRemoved: {
          addListener: vi.fn((callback: TabRemovedListener) => {
            tabRemovedListener = callback;
          })
        }
      },
      windows: {
        create: windowsCreate,
        onRemoved: {
          addListener: vi.fn((callback: WindowRemovedListener) => {
            windowRemovedListener = callback;
          })
        }
      }
    });

    await import("./background");
  });

  test("settings check succeeds only when endpoint returns pong", async () => {
    const sendResponse = vi.fn();

    listener(
      {
        type: "AI_WALLET_CHECK_SETTINGS",
        payload: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example.test/v1" }
      },
      {},
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://proxy.example.test/v1/models", {
      method: "GET",
      headers: { Authorization: "Bearer sk-test" }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://proxy.example.test/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-test",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-5.5", input: "Reply with exactly: pong", stream: false })
    });
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      settings: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example.test/v1" },
      models: ["gpt-5.5"],
      modelSource: "discovered",
      modelFetchError: ""
    });
  });

  test("settings check fetches models and uses first discovered model for pong", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ data: [{ id: "model-a" }, { id: "model-b" }] }) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ output_text: "pong" }) });
    const sendResponse = vi.fn();

    listener(
      { type: "AI_WALLET_CHECK_SETTINGS", payload: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example/openai" } },
      popupPageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://proxy.example/openai/models", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://proxy.example/openai/responses",
      expect.objectContaining({ body: JSON.stringify({ model: "model-a", input: "Reply with exactly: pong", stream: false }) })
    );
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      settings: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example/openai" },
      models: ["model-a", "model-b"],
      modelSource: "discovered",
      modelFetchError: ""
    });
  });

  test("settings check prefers known MVP model over arbitrary discovered model for pong", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ data: [{ id: "unavailable-model" }, { id: "gpt-4.1-mini" }] }) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ output_text: "pong" }) });
    const sendResponse = vi.fn();

    listener(
      { type: "AI_WALLET_CHECK_SETTINGS", payload: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example/openai" } },
      popupPageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://proxy.example/openai/responses",
      expect.objectContaining({ body: JSON.stringify({ model: "gpt-4.1-mini", input: "Reply with exactly: pong", stream: false }) })
    );
  });

  test("settings check falls back when models endpoint fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, json: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ output_text: "pong" }) });
    const sendResponse = vi.fn();

    listener(
      { type: "AI_WALLET_CHECK_SETTINGS", payload: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example/openai" } },
      popupPageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://proxy.example/openai/responses",
      expect.objectContaining({ body: JSON.stringify({ model: "gpt-5.5", input: "Reply with exactly: pong", stream: false }) })
    );
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      modelSource: "fallback",
      modelFetchError: "Models check failed with HTTP 404"
    }));
  });

  test("settings check rejects compatible HTTP success without pong", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ output_text: "hello" }) });
    const sendResponse = vi.fn();

    listener(
      {
        type: "AI_WALLET_CHECK_SETTINGS",
        payload: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example.test/v1/responses" }
      },
      {},
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "Endpoint did not return pong" });
  });

  test("settings check rejects malformed JSON response", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error("bad json")) });
    const sendResponse = vi.fn();

    listener(
      {
        type: "AI_WALLET_CHECK_SETTINGS",
        payload: { openAiApiKey: "sk-test", aiServiceEndpoint: "https://proxy.example.test/v1/responses" }
      },
      {},
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "Endpoint did not return pong" });
  });

  test("request accounts opens approval and exposes pending request", async () => {
    const requesterResponse = vi.fn();

    const keepsChannelOpen = listener(
      {
        method: "ai_requestAccounts",
        params: { models: ["gpt-5.5", "unknown-model"], reason: "Need chat" }
      },
      { origin: "https://demo.localhost", tab: { id: 7 } as chrome.tabs.Tab, frameId: 2 },
      requesterResponse
    );

    expect(keepsChannelOpen).toBe(true);
    expect(requesterResponse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(windowsCreate).toHaveBeenCalledWith({
      url: expect.stringContaining("chrome-extension://wallet/src/approval.html?request="),
      type: "popup",
      width: 420,
      height: 520
    });

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);

    expect(approvalResponse).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      origin: "https://demo.localhost",
      reason: "Need chat",
      providerId: "provider_openai",
      models: ["gpt-5.5"]
    }));
  });

  test("request accounts rejects when no supported models requested", async () => {
    const sendResponse = vi.fn();

    const result = listener(
      { method: "ai_requestAccounts", params: { models: ["unknown-model"] } },
      { origin: "https://demo.localhost", tab: { id: 7 } as chrome.tabs.Tab, frameId: 0 },
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ error: "No supported models requested" });
    expect(windowsCreate).not.toHaveBeenCalled();
  });

  test("ai_getModels returns active model list and source", async () => {
    storageGet.mockResolvedValueOnce({ aiWalletAvailableModels: ["model-a"], aiWalletModelSource: "discovered" });
    const sendResponse = vi.fn();

    listener({ method: "ai_getModels" }, pageSender, sendResponse);
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({ models: ["model-a"], source: "discovered" });
  });

  test("request accounts uses active discovered model list", async () => {
    storageGet.mockResolvedValueOnce({ aiWalletAvailableModels: ["model-a"], aiWalletModelSource: "discovered" });
    const requesterResponse = vi.fn();

    listener({ method: "ai_requestAccounts", params: { models: ["model-a", "gpt-5.5"], reason: "Need chat" } }, pageSender, requesterResponse);
    await vi.advanceTimersByTimeAsync(0);

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    expect(approvalResponse).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      origin: "https://demo.localhost",
      reason: "Need chat",
      providerId: "provider_openai",
      models: ["model-a"]
    }));
  });

  test("approval decision creates scoped session and get permissions returns it", async () => {
    const requesterResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Need chat" } },
      { origin: "https://demo.localhost", tab: { id: 7 } as chrome.tabs.Tab, frameId: 2 },
      requesterResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };

    const decisionResponse = vi.fn();
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      approvalPageSender,
      decisionResponse
    );
    await vi.runAllTimersAsync();

    expect(decisionResponse).toHaveBeenCalledWith({ ok: true });
    expect(requesterResponse).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: expect.stringMatching(/^session_[0-9a-f-]{36}$/),
      origin: "https://demo.localhost",
      tabId: 7,
      frameId: 2,
      providerId: "provider_openai",
      models: ["gpt-5.5"],
      expiresAt: "2026-06-07T12:30:00.000Z"
    }));

    const permissionsResponse = vi.fn();
    listener(
      { method: "ai_getPermissions" },
      { origin: "https://demo.localhost", tab: { id: 7 } as chrome.tabs.Tab, frameId: 2 },
      permissionsResponse
    );
    await vi.runAllTimersAsync();

    expect(permissionsResponse).toHaveBeenCalledWith({ permissions: [requesterResponse.mock.calls[0][0]] });
  });

  test("get permissions restores active sessions from storage", async () => {
    const restoredSession = {
      sessionId: "session_restored",
      origin: "https://demo.localhost",
      tabId: 7,
      frameId: 2,
      models: ["gpt-5.5"],
      expiresAt: "2026-06-07T12:30:00.000Z"
    };
    storageGet.mockResolvedValueOnce({ aiWalletSessions: [restoredSession] });
    const sendResponse = vi.fn();

    listener({ method: "ai_getPermissions" }, pageSender, sendResponse);
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({ permissions: [expect.objectContaining(restoredSession)] });
  });

  test("popup can list and revoke active sessions", async () => {
    const restoredSession = {
      sessionId: "session_restored",
      origin: "https://demo.localhost",
      tabId: 7,
      frameId: 2,
      models: ["gpt-5.5"],
      expiresAt: "2026-06-07T12:30:00.000Z"
    };
    storageGet.mockResolvedValueOnce({ aiWalletSessions: [restoredSession] });
    const listResponse = vi.fn();

    listener({ type: "AI_WALLET_LIST_SESSIONS" }, popupPageSender, listResponse);
    await vi.runAllTimersAsync();

    expect(listResponse).toHaveBeenCalledWith({ sessions: [expect.objectContaining(restoredSession)] });

    const revokeResponse = vi.fn();
    listener({ type: "AI_WALLET_REVOKE_SESSION", payload: { sessionId: restoredSession.sessionId } }, popupPageSender, revokeResponse);
    await vi.runAllTimersAsync();

    expect(revokeResponse).toHaveBeenCalledWith({ ok: true });
    expect(storageSet).toHaveBeenLastCalledWith({ aiWalletSessions: [] });
  });

  test("website cannot list or revoke popup-managed sessions", async () => {
    const restoredSession = {
      sessionId: "session_restored",
      origin: "https://other.localhost",
      tabId: 3,
      frameId: 0,
      models: ["gpt-5.5"],
      expiresAt: "2026-06-07T12:30:00.000Z"
    };
    storageGet.mockResolvedValueOnce({ aiWalletSessions: [restoredSession] });
    const listResponse = vi.fn();

    listener({ type: "AI_WALLET_LIST_SESSIONS" }, pageSender, listResponse);
    await vi.runAllTimersAsync();

    expect(listResponse).toHaveBeenCalledWith({ error: "Extension page only" });

    const revokeResponse = vi.fn();
    listener({ type: "AI_WALLET_REVOKE_SESSION", payload: { sessionId: restoredSession.sessionId } }, pageSender, revokeResponse);
    await vi.runAllTimersAsync();

    expect(revokeResponse).toHaveBeenCalledWith({ error: "Extension page only" });
  });

  test("website disconnect cannot revoke another origin session", async () => {
    const restoredSession = {
      sessionId: "session_other",
      origin: "https://other.localhost",
      tabId: 3,
      frameId: 0,
      models: ["gpt-5.5"],
      expiresAt: "2026-06-07T12:30:00.000Z"
    };
    storageGet.mockResolvedValueOnce({ aiWalletSessions: [restoredSession] });
    const disconnectResponse = vi.fn();

    listener({ method: "ai_disconnect", params: { sessionId: restoredSession.sessionId } }, pageSender, disconnectResponse);
    await vi.runAllTimersAsync();

    expect(disconnectResponse).toHaveBeenCalledWith({ ok: false, error: "Session not found or not approved" });
    expect(storageSet).not.toHaveBeenCalledWith({ aiWalletSessions: [] });
  });

  test("approval decision accepts approval page sender with query string", async () => {
    const requesterResponse = vi.fn();
    listener({ method: "ai_requestAccounts", params: { models: ["gpt-5.5"] } }, pageSender, requesterResponse);
    await vi.advanceTimersByTimeAsync(0);
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };
    const sendResponse = vi.fn();

    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      { url: `chrome-extension://wallet/src/approval.html?request=${encodeURIComponent(JSON.stringify(approval))}` },
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(requesterResponse).toHaveBeenCalledWith(expect.objectContaining({ origin: "https://demo.localhost", models: ["gpt-5.5"] }));
  });

  test("approval decision accepts approval page sender when Chrome includes a tab", async () => {
    const requesterResponse = vi.fn();
    listener({ method: "ai_requestAccounts", params: { models: ["gpt-5.5"] } }, pageSender, requesterResponse);
    await vi.advanceTimersByTimeAsync(0);
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };
    const sendResponse = vi.fn();

    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      { url: "chrome-extension://wallet/src/approval.html", tab: { id: 99 } as chrome.tabs.Tab },
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(requesterResponse).toHaveBeenCalledWith(expect.objectContaining({ origin: "https://demo.localhost", models: ["gpt-5.5"] }));
  });

  test("reject approval returns error to original requester", async () => {
    const requesterResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"] } },
      { origin: "https://demo.localhost", tab: { id: 7 } as chrome.tabs.Tab, frameId: 0 },
      requesterResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };

    const decisionResponse = vi.fn();
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: false, models: [] } },
      approvalPageSender,
      decisionResponse
    );

    expect(decisionResponse).toHaveBeenCalledWith({ ok: true });
    expect(requesterResponse).toHaveBeenCalledWith({ error: "User rejected AI Wallet access" });
  });

  test("content sender cannot get approval request", async () => {
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Need chat" } },
      pageSender,
      vi.fn()
    );
    await vi.advanceTimersByTimeAsync(0);

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, pageSender, approvalResponse);

    expect(approvalResponse).toHaveBeenCalledWith(null);
  });

  test("content sender cannot decide approval or resolve pending requester", async () => {
    const requesterResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Need chat" } },
      pageSender,
      requesterResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };

    const pageDecisionResponse = vi.fn();
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      pageSender,
      pageDecisionResponse
    );

    expect(pageDecisionResponse).toHaveBeenCalledWith({ ok: false, error: "Approval page only" });
    expect(requesterResponse).not.toHaveBeenCalled();

    const approvalDecisionResponse = vi.fn();
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: false, models: [] } },
      approvalPageSender,
      approvalDecisionResponse
    );

    expect(approvalDecisionResponse).toHaveBeenCalledWith({ ok: true });
    expect(requesterResponse).toHaveBeenCalledWith({ error: "User rejected AI Wallet access" });
  });

  test("second request accounts while pending returns error and keeps first approval", async () => {
    const firstResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "First" } },
      pageSender,
      firstResponse
    );

    const secondResponse = vi.fn();
    const result = listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Second" } },
      { origin: "https://other.localhost", tab: { id: 8 } as chrome.tabs.Tab, frameId: 0 },
      secondResponse
    );

    expect(result).toBe(true);
    expect(secondResponse).toHaveBeenCalledWith({ error: "Approval request already pending" });

    const approvalResponse = vi.fn();
    await vi.advanceTimersByTimeAsync(0);
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);

    expect(approvalResponse).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      origin: "https://demo.localhost",
      reason: "First",
      providerId: "provider_openai",
      models: ["gpt-5.5"]
    }));
    expect(windowsCreate).toHaveBeenCalledTimes(1);
    expect(firstResponse).not.toHaveBeenCalled();
  });

  test("closing approval window expires pending approval and allows next request", async () => {
    const firstResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "First" } },
      pageSender,
      firstResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    windowRemovedListener(1);

    expect(firstResponse).toHaveBeenCalledWith({ error: "Approval request expired" });

    const secondResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Second" } },
      { origin: "https://other.localhost", tab: { id: 8 } as chrome.tabs.Tab, frameId: 0 },
      secondResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);

    expect(secondResponse).not.toHaveBeenCalled();
    expect(approvalResponse).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      origin: "https://other.localhost",
      reason: "Second",
      providerId: "provider_openai",
      models: ["gpt-5.5"]
    }));
  });

  test("failed approval popup creation expires pending approval and allows next request", async () => {
    windowsCreate.mockRejectedValueOnce(new Error("popup failed"));
    const firstResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "First" } },
      pageSender,
      firstResponse
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(firstResponse).toHaveBeenCalledWith({ error: "Approval request expired" });

    const secondResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Second" } },
      pageSender,
      secondResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(secondResponse).not.toHaveBeenCalled();
    expect(windowsCreate).toHaveBeenCalledTimes(2);
  });

  test("approval popup creation without window id expires pending approval and allows next request", async () => {
    windowsCreate.mockResolvedValueOnce(undefined);
    const firstResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "First" } },
      pageSender,
      firstResponse
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(firstResponse).toHaveBeenCalledWith({ error: "Approval request expired" });

    const secondResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Second" } },
      pageSender,
      secondResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(secondResponse).not.toHaveBeenCalled();
    expect(windowsCreate).toHaveBeenCalledTimes(2);
  });

  test("approval timeout expires pending approval", async () => {
    const requesterResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Need chat" } },
      pageSender,
      requesterResponse
    );
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(requesterResponse).toHaveBeenCalledWith({ error: "Approval request expired" });
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    expect(approvalResponse).toHaveBeenCalledWith(null);
  });

  test.each([
    { params: null },
    { params: "invalid" },
    { params: { models: "gpt-5.5" } },
    { params: { models: ["gpt-5.5", 5] } },
    { params: { models: ["gpt-5.5"], reason: 5 } }
  ])("malformed account request returns invalid account request for $params", ({ params }) => {
    const sendResponse = vi.fn();

    const result = listener({ method: "ai_requestAccounts", params }, pageSender, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ error: "Invalid account request" });
    expect(windowsCreate).not.toHaveBeenCalled();
  });

  test.each([
    undefined,
    null,
    "invalid",
    { id: 5, approved: true, models: ["gpt-5.5"] },
    { id: "approval", approved: "true", models: ["gpt-5.5"] },
    { id: "approval", approved: true, models: "gpt-5.5" },
    { id: "approval", approved: true, models: ["gpt-5.5", 5] }
  ])("malformed approval decision returns invalid approval decision", (payload) => {
    const sendResponse = vi.fn();

    const result = listener({ type: "AI_WALLET_APPROVAL_DECISION", payload }, approvalPageSender, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "Invalid approval decision" });
  });

  test("stream broker validates session, calls API, and forwards stream events", async () => {
    storageGet.mockResolvedValue({ openAiApiKey: "sk-test", aiServiceEndpoint: "https://api.openai.com/v1" });
    const requesterResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Need chat" } },
      pageSender,
      requesterResponse
    );
    await vi.advanceTimersByTimeAsync(0);
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      approvalPageSender,
      vi.fn()
    );
    await vi.runAllTimersAsync();
    const session = requesterResponse.mock.calls[0][0] as { sessionId: string };
    const port = createPort(pageSender);

    connectListener(port as unknown as chrome.runtime.Port);
    port.emitMessage({ method: "ai_requestResponseStream", params: { sessionId: session.sessionId, model: "gpt-5.5", input: "1+2=?" } });
    await vi.runAllTimersAsync();

    expect(streamResponsesApi).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "sk-test",
      model: "gpt-5.5",
      input: "1+2=?",
      signal: expect.any(AbortSignal),
      onEvent: expect.any(Function)
    }));
    expect(port.postMessage).toHaveBeenCalledWith({ type: "delta", delta: "3" });
    expect(port.postMessage).toHaveBeenCalledWith({ type: "done" });
  });

  test("stream broker rejects missing stream parameters", async () => {
    const port = createPort(pageSender);

    connectListener(port as unknown as chrome.runtime.Port);
    port.emitMessage({ method: "ai_requestResponseStream", params: { sessionId: "session_1", model: "gpt-5.5" } });
    await vi.runAllTimersAsync();

    expect(port.postMessage).toHaveBeenCalledWith({ type: "error", error: "Missing stream parameters" });
    expect(streamResponsesApi).not.toHaveBeenCalled();
  });

  test("stream broker rejects invalid stored endpoint before fetch", async () => {
    storageGet.mockResolvedValue({ openAiApiKey: "sk-test", aiServiceEndpoint: "http://api.example.test/v1/responses" });
    const requesterResponse = vi.fn();
    listener(
      { method: "ai_requestAccounts", params: { models: ["gpt-5.5"], reason: "Need chat" } },
      pageSender,
      requesterResponse
    );
    await vi.advanceTimersByTimeAsync(0);
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      approvalPageSender,
      vi.fn()
    );
    await vi.runAllTimersAsync();
    const session = requesterResponse.mock.calls[0][0] as { sessionId: string };
    const port = createPort(pageSender);

    connectListener(port as unknown as chrome.runtime.Port);
    port.emitMessage({ method: "ai_requestResponseStream", params: { sessionId: session.sessionId, model: "gpt-5.5", input: "1+2=?" } });
    await vi.runAllTimersAsync();

    expect(port.postMessage).toHaveBeenCalledWith({ type: "error", error: "Endpoint must use HTTPS unless it is localhost" });
    expect(streamResponsesApi).not.toHaveBeenCalled();
  });

  test("stream port rejects second message on same port", async () => {
    streamResponsesApi.mockImplementation(async () => undefined);
    const requesterResponse = vi.fn();
    listener({ method: "ai_requestAccounts", params: { models: ["gpt-5.5"] } }, pageSender, requesterResponse);
    await vi.advanceTimersByTimeAsync(0);
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      approvalPageSender,
      vi.fn()
    );
    await vi.runAllTimersAsync();
    const session = requesterResponse.mock.calls[0][0] as { sessionId: string };
    const port = createPort(pageSender);
    const message = { method: "ai_requestResponseStream", params: { sessionId: session.sessionId, model: "gpt-5.5", input: "1+2=?" } };

    connectListener(port as unknown as chrome.runtime.Port);
    port.emitMessage(message);
    port.emitMessage(message);
    await vi.runAllTimersAsync();

    expect(port.postMessage).toHaveBeenCalledWith({ type: "error", error: "Stream port already used" });
    expect(streamResponsesApi).toHaveBeenCalledTimes(1);
  });

  test("disconnect revokes session and tab removal clears sessions", async () => {
    const requesterResponse = vi.fn();
    listener({ method: "ai_requestAccounts", params: { models: ["gpt-5.5"] } }, pageSender, requesterResponse);
    await vi.advanceTimersByTimeAsync(0);
    const approvalResponse = vi.fn();
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const approval = approvalResponse.mock.calls[0][0] as { id: string };
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: approval.id, approved: true, models: ["gpt-5.5"] } },
      approvalPageSender,
      vi.fn()
    );
    await vi.runAllTimersAsync();
    const session = requesterResponse.mock.calls[0][0] as { sessionId: string };

    const disconnectResponse = vi.fn();
    listener({ method: "ai_disconnect", params: { sessionId: session.sessionId } }, pageSender, disconnectResponse);
    await vi.runAllTimersAsync();

    expect(disconnectResponse).toHaveBeenCalledWith({ ok: true });
    const permissionsAfterDisconnect = vi.fn();
    listener({ method: "ai_getPermissions" }, pageSender, permissionsAfterDisconnect);
    await vi.runAllTimersAsync();
    expect(permissionsAfterDisconnect).toHaveBeenCalledWith({ permissions: [] });

    listener({ method: "ai_requestAccounts", params: { models: ["gpt-5.5"] } }, pageSender, requesterResponse);
    await vi.advanceTimersByTimeAsync(0);
    listener({ type: "AI_WALLET_GET_APPROVAL_REQUEST" }, approvalPageSender, approvalResponse);
    const secondApproval = approvalResponse.mock.calls[1][0] as { id: string };
    listener(
      { type: "AI_WALLET_APPROVAL_DECISION", payload: { id: secondApproval.id, approved: true, models: ["gpt-5.5"] } },
      approvalPageSender,
      vi.fn()
    );
    await vi.runAllTimersAsync();

    tabRemovedListener(7);
    await vi.runAllTimersAsync();

    const permissionsAfterTabClose = vi.fn();
    listener({ method: "ai_getPermissions" }, pageSender, permissionsAfterTabClose);
    await vi.runAllTimersAsync();
    expect(permissionsAfterTabClose).toHaveBeenCalledWith({ permissions: [] });
  });
});
