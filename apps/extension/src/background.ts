import { SUPPORTED_MODELS } from "@aipocket/protocol";

import { checkProvider, streamProvider } from "./provider-adapters";
import { migrateStoredProviders, normalizeProviderInput, PROVIDERS_STORAGE_KEY, type ProviderConfig, type ProviderInput } from "./providers";
import {
  buildEndpointCheckRequest,
  endpointCheckHasPong,
  extractModelIds,
  normalizeSettingsInput,
  resolveModelsEndpoint,
  resolveResponsesEndpoint
} from "./settings";
import { createSessionStore, type AiWalletSession } from "./session-store";

type PendingApproval = {
  id: string;
  origin: string;
  tabId: number;
  frameId: number;
  reason: string;
  providerId: string;
  providerName: string;
  providerType: ProviderConfig["type"];
  requestLimit?: number;
  models: string[];
  sendResponse: (response?: unknown) => void;
};

const SESSION_STORAGE_KEY = "aiWalletSessions";
const FALLBACK_MODELS = [...SUPPORTED_MODELS];

const sessionStore = createSessionStore({
  storage: {
    async getSessions() {
      const result = await chrome.storage.local.get([SESSION_STORAGE_KEY]);
      return result[SESSION_STORAGE_KEY];
    },
    async setSessions(sessions: AiWalletSession[]) {
      await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: sessions });
    }
  }
});
const APPROVAL_TIMEOUT_MS = 60_000;

let currentApproval: PendingApproval | null = null;
let approvalWindowId: number | null = null;
let approvalTimeoutId: ReturnType<typeof setTimeout> | null = null;
let approvalSetupPending = false;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isApprovalPageSender(sender: chrome.runtime.MessageSender) {
  if (!sender.url) {
    return false;
  }

  try {
    const senderUrl = new URL(sender.url);
    const approvalUrl = new URL(chrome.runtime.getURL("src/approval.html"));
    return senderUrl.origin === approvalUrl.origin && senderUrl.pathname === approvalUrl.pathname;
  } catch {
    return false;
  }
}

function isExtensionPageSender(sender: chrome.runtime.MessageSender) {
  if (!sender.url) {
    return false;
  }

  try {
    const senderUrl = new URL(sender.url);
    const extensionUrl = new URL(chrome.runtime.getURL(""));
    return senderUrl.origin === extensionUrl.origin;
  } catch {
    return false;
  }
}

function getSenderScope(sender: chrome.runtime.MessageSender) {
  return {
    origin: sender.origin ?? new URL(sender.url ?? "about:blank").origin,
    tabId: sender.tab?.id ?? -1,
    frameId: sender.frameId ?? 0
  };
}

function clearApprovalTracking() {
  if (approvalTimeoutId !== null) {
    clearTimeout(approvalTimeoutId);
    approvalTimeoutId = null;
  }
  approvalWindowId = null;
  approvalSetupPending = false;
}

function expireCurrentApproval() {
  if (!currentApproval) {
    clearApprovalTracking();
    return;
  }

  const approval = currentApproval;
  currentApproval = null;
  clearApprovalTracking();
  approval.sendResponse({ error: "Approval request expired" });
}

async function openApprovalWindow() {
  const approvalRequest = getApprovalRequest();
  const approvalUrl = new URL(chrome.runtime.getURL("src/approval.html"));
  if (approvalRequest) {
    approvalUrl.searchParams.set("request", JSON.stringify(approvalRequest));
  }

  const createdWindow = await chrome.windows.create({
    url: approvalUrl.toString(),
    type: "popup",
    width: 420,
    height: 520
  });

  if (!createdWindow?.id) {
    expireCurrentApproval();
    return;
  }

  approvalWindowId = createdWindow.id;
}

function getApprovalRequest() {
  if (!currentApproval) {
    return null;
  }

  return {
      id: currentApproval.id,
      origin: currentApproval.origin,
      reason: currentApproval.reason,
      providerId: currentApproval.providerId,
      providerName: currentApproval.providerName,
      providerType: currentApproval.providerType,
      requestLimit: currentApproval.requestLimit,
      models: currentApproval.models
    };
}

async function getStoredProviders(): Promise<ProviderConfig[]> {
  const stored = await chrome.storage.local.get([PROVIDERS_STORAGE_KEY, "openAiApiKey", "aiServiceEndpoint", "aiWalletAvailableModels"]);
  const providers = migrateStoredProviders(stored).map((provider) =>
    provider.models.length === 0 && provider.type === "openai-compatible" ? { ...provider, models: [...FALLBACK_MODELS] } : provider
  );
  if (providers.length === 0 && isStringArray(stored.aiWalletAvailableModels) && stored.aiWalletAvailableModels.length > 0) {
    return [
      {
        id: "provider_openai",
        type: "openai-compatible",
        name: "OpenAI-compatible",
        apiKey: typeof stored.openAiApiKey === "string" ? stored.openAiApiKey : "legacy-key",
        endpoint: typeof stored.aiServiceEndpoint === "string" ? stored.aiServiceEndpoint : "https://api.openai.com/v1/responses",
        models: stored.aiWalletAvailableModels,
        enabled: true
      }
    ];
  }
  if (!Array.isArray(stored[PROVIDERS_STORAGE_KEY]) && providers.length > 0) {
    await chrome.storage.local.set({ [PROVIDERS_STORAGE_KEY]: providers });
  }
  return providers;
}

async function getProvider(providerId: string) {
  return (await getStoredProviders()).find((provider) => provider.id === providerId) ?? null;
}

async function getActiveModelInfo(): Promise<{ models: string[]; source: "discovered" | "fallback" }> {
  const stored = await chrome.storage.local.get(["aiWalletAvailableModels", "aiWalletModelSource"]);
  if (isStringArray(stored.aiWalletAvailableModels) && stored.aiWalletAvailableModels.length > 0) {
    return { models: stored.aiWalletAvailableModels, source: stored.aiWalletModelSource === "discovered" ? "discovered" : "fallback" };
  }

  const providers = await getStoredProviders();
  const models = providers.flatMap((provider) => provider.models);
  return { models: models.length > 0 ? models : [...FALLBACK_MODELS], source: models.length > 0 ? "discovered" : "fallback" };
}

async function checkSettings(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid settings payload" };
  }

  const legacyInput = payload as { openAiApiKey?: unknown; aiServiceEndpoint?: unknown };
  if (typeof legacyInput.openAiApiKey === "string") {
    if (legacyInput.aiServiceEndpoint !== undefined && typeof legacyInput.aiServiceEndpoint !== "string") {
      return { ok: false, error: "Invalid settings payload" };
    }

    const normalized = normalizeSettingsInput({
      openAiApiKey: legacyInput.openAiApiKey,
      aiServiceEndpoint: typeof legacyInput.aiServiceEndpoint === "string" ? legacyInput.aiServiceEndpoint : ""
    });
    if (!normalized.ok) {
      return { ok: false, error: normalized.reason };
    }

    let models: string[] = [...FALLBACK_MODELS];
    let modelSource: "discovered" | "fallback" = "fallback";
    let modelFetchError = "";
    try {
      const modelsResponse = await fetch(resolveModelsEndpoint(normalized.settings.aiServiceEndpoint), {
        method: "GET",
        headers: { Authorization: `Bearer ${normalized.settings.openAiApiKey}` }
      });
      if (modelsResponse.ok) {
        const discovered = extractModelIds(await modelsResponse.json().catch(() => null));
        if (discovered.length > 0) {
          models = discovered;
          modelSource = "discovered";
        } else {
          modelFetchError = "Models endpoint returned no model ids";
        }
      } else {
        modelFetchError = `Models check failed with HTTP ${modelsResponse.status}`;
      }
    } catch (error) {
      modelFetchError = error instanceof Error ? error.message : "Models check failed";
    }

    const checkModel = ["gpt-5.5", "gpt-4.1-mini", ...SUPPORTED_MODELS].find((model) => models.includes(model)) ?? models[0];
    const response = await fetch(resolveResponsesEndpoint(normalized.settings.aiServiceEndpoint), {
      method: "POST",
      headers: { Authorization: `Bearer ${normalized.settings.openAiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildEndpointCheckRequest(checkModel))
    });
    if (!response.ok) {
      return { ok: false, error: `Endpoint check failed with HTTP ${response.status}` };
    }
    if (!endpointCheckHasPong(await response.json().catch(() => null))) {
      return { ok: false, error: "Endpoint did not return pong" };
    }
    return { ok: true, settings: normalized.settings, models, modelSource, modelFetchError };
  }

  const input = payload as Partial<ProviderInput>;
  if (
    (input.id !== undefined && typeof input.id !== "string") ||
    typeof input.type !== "string" ||
    typeof input.name !== "string" ||
    typeof input.apiKey !== "string" ||
    (input.endpoint !== undefined && typeof input.endpoint !== "string") ||
    (input.requestLimit !== undefined && typeof input.requestLimit !== "string")
  ) {
    return { ok: false, error: "Invalid settings payload" };
  }

  const normalized = normalizeProviderInput(input as ProviderInput);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const check = await checkProvider(normalized.provider);
  if (!check.ok) {
    return check;
  }

  return {
    ok: true,
    provider: { ...normalized.provider, models: check.models },
    models: check.models,
    modelSource: check.modelSource,
    modelFetchError: check.modelFetchError
  };
}

function isStreamRequest(message: unknown): message is { method: "ai_requestResponseStream"; params: { sessionId: string; providerId?: string; model: string; input: string } } {
  if (!isObject(message) || message.method !== "ai_requestResponseStream" || !isObject(message.params)) {
    return false;
  }

  return (
    typeof message.params.sessionId === "string" &&
    (message.params.providerId === undefined || typeof message.params.providerId === "string") &&
    typeof message.params.model === "string" &&
    typeof message.params.input === "string"
  );
}

async function handleStreamRequest(port: chrome.runtime.Port, message: unknown, signal: AbortSignal) {
  let terminalSent = false;
  const sendTerminal = (error: string) => {
    if (!terminalSent) {
      terminalSent = true;
      port.postMessage({ type: "error", error });
      port.disconnect?.();
    }
  };

  if (!isStreamRequest(message)) {
    sendTerminal("Missing stream parameters");
    return;
  }

  const scope = getSenderScope(port.sender ?? {});
  const activeSession = await sessionStore.getActivePermission(message.params.sessionId);
  const providerId = message.params.providerId ?? activeSession?.providerId ?? "";
  const permission = await sessionStore.getValidPermission({
      sessionId: message.params.sessionId,
      origin: scope.origin,
      tabId: scope.tabId,
      frameId: scope.frameId,
      providerId,
      model: message.params.model
    });

  if (!permission) {
    sendTerminal("Session not found or not approved");
    return;
  }

  const provider = await getProvider(providerId);
  if (!provider) {
    sendTerminal("Provider not found");
    return;
  }
  if (!provider.enabled) {
    sendTerminal("Provider disabled");
    return;
  }
  if (!provider.models.includes(message.params.model)) {
    sendTerminal("Model is not available for this provider");
    return;
  }

  await sessionStore.incrementRequestCount(permission.sessionId);

  try {
    await streamProvider(
      provider,
      { model: message.params.model, input: message.params.input },
      (event) => {
        if (event.type === "delta") {
          port.postMessage({ type: "delta", delta: event.delta });
        } else if (event.type === "completed") {
          terminalSent = true;
          port.postMessage({ type: "done" });
          port.disconnect?.();
        } else if (event.type === "error") {
          sendTerminal(event.message);
        }
      },
      signal
    );
  } catch (error) {
    if (signal.aborted) {
      return;
    }

    sendTerminal(error instanceof Error ? error.message : "Stream failed");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AI_WALLET_SUPPORTED_MODELS") {
    sendResponse({ models: SUPPORTED_MODELS, origin: sender.origin });
    return true;
  }

  if (message?.method === "ai_getModels") {
    void getActiveModelInfo()
      .then((modelInfo) => sendResponse(modelInfo))
      .catch(() => sendResponse({ models: [...FALLBACK_MODELS], source: "fallback" }));
    return true;
  }

  if (message?.method === "ai_requestAccounts") {
    if (currentApproval || approvalSetupPending) {
      sendResponse({ error: "Approval request already pending" });
      return true;
    }

    if (!isObject(message.params)) {
      sendResponse({ error: "Invalid account request" });
      return true;
    }

    const params = message.params;
    if (
      (params.providerId !== undefined && typeof params.providerId !== "string") ||
      (params.models !== undefined && !isStringArray(params.models)) ||
      (params.reason !== undefined && typeof params.reason !== "string")
    ) {
      sendResponse({ error: "Invalid account request" });
      return true;
    }

    approvalSetupPending = true;
    void (async () => {
      const scope = getSenderScope(sender);
      const models = (params.models ?? []) as string[];
      const providers = await getStoredProviders();
      const provider = typeof params.providerId === "string" ? providers.find((item) => item.id === params.providerId) ?? null : providers[0] ?? null;
      if (!provider) {
        approvalSetupPending = false;
        sendResponse({ error: "Provider not found" });
        return;
      }
      if (!provider.enabled) {
        approvalSetupPending = false;
        sendResponse({ error: "Provider disabled" });
        return;
      }
      const requestedModels = models.filter((model) => provider.models.includes(model));

      if (requestedModels.length === 0) {
        approvalSetupPending = false;
        sendResponse({ error: "No supported models requested" });
        return;
      }

      currentApproval = {
        id: crypto.randomUUID(),
        ...scope,
        reason: params?.reason ?? "Website requests AI model access",
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        requestLimit: provider.requestLimit,
        models: requestedModels,
        sendResponse
      };
      approvalSetupPending = false;

      approvalTimeoutId = setTimeout(expireCurrentApproval, APPROVAL_TIMEOUT_MS);
      void openApprovalWindow().catch(() => expireCurrentApproval());
    })().catch(() => {
      approvalSetupPending = false;
      sendResponse({ error: "No supported models requested" });
    });
    return true;
  }

  if (message?.method === "ai_getPermissions") {
    const scope = getSenderScope(sender);
    void sessionStore
      .getPermissionsForOrigin(scope.origin, scope.tabId, scope.frameId)
      .then((permissions) => sendResponse({ permissions }))
      .catch(() => sendResponse({ permissions: [] }));
    return true;
  }

  if (message?.method === "ai_disconnect") {
    void (async () => {
      if (isObject(message.params) && typeof message.params.sessionId === "string") {
        const scope = getSenderScope(sender);
        const session = await sessionStore.getActivePermission(message.params.sessionId);
        if (!session || session.origin !== scope.origin || session.tabId !== scope.tabId || session.frameId !== scope.frameId) {
          sendResponse({ ok: false, error: "Session not found or not approved" });
          return;
        }

        await sessionStore.revokeSession(message.params.sessionId);
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "AI_WALLET_LIST_SESSIONS") {
    if (!isExtensionPageSender(sender)) {
      sendResponse({ error: "Extension page only" });
      return true;
    }

    void sessionStore
      .getAllSessions()
      .then((sessions) => sendResponse({ sessions }))
      .catch(() => sendResponse({ sessions: [] }));
    return true;
  }

  if (message?.type === "AI_WALLET_REVOKE_SESSION") {
    if (!isExtensionPageSender(sender)) {
      sendResponse({ error: "Extension page only" });
      return true;
    }

    void (async () => {
      if (isObject(message.payload) && typeof message.payload.sessionId === "string") {
        await sessionStore.revokeSession(message.payload.sessionId);
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "AI_WALLET_GET_APPROVAL_REQUEST") {
    if (!isApprovalPageSender(sender)) {
      sendResponse(null);
      return true;
    }

    sendResponse(getApprovalRequest());
    return true;
  }

  if (message?.type === "AI_WALLET_APPROVAL_DECISION") {
    if (!isApprovalPageSender(sender)) {
      sendResponse({ ok: false, error: "Approval page only" });
      return true;
    }

    const payload = message.payload;
    if (
      !isObject(payload) ||
      typeof payload.id !== "string" ||
      typeof payload.approved !== "boolean" ||
      !isStringArray(payload.models)
    ) {
      sendResponse({ ok: false, error: "Invalid approval decision" });
      return true;
    }

    if (!currentApproval || payload.id !== currentApproval.id) {
      sendResponse({ ok: false, error: "Approval request not found" });
      return true;
    }

    const approval = currentApproval;
    currentApproval = null;
    clearApprovalTracking();

    if (!payload.approved) {
      approval.sendResponse({ error: "User rejected AI Wallet access" });
      sendResponse({ ok: true });
      return true;
    }

    const approvedModels = (payload.models ?? []).filter((model) => approval.models.includes(model));
    if (approvedModels.length === 0) {
      approval.sendResponse({ error: "No models approved" });
      sendResponse({ ok: false, error: "No models approved" });
      return true;
    }

    void (async () => {
      const session = await sessionStore.createSession({
        origin: approval.origin,
        tabId: approval.tabId,
        frameId: approval.frameId,
        providerId: approval.providerId,
        requestLimit: approval.requestLimit,
        models: approvedModels
      });

      approval.sendResponse(session);
      sendResponse({ ok: true });
    })().catch(() => {
      approval.sendResponse({ error: "Failed to create session" });
      sendResponse({ ok: false, error: "Failed to create session" });
    });
    return true;
  }

  if (message?.type === "AI_WALLET_CHECK_SETTINGS") {
    void checkSettings(message.payload)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "Endpoint check failed" }));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai-wallet-stream") {
    return;
  }

  const controller = new AbortController();
  let used = false;

  port.onDisconnect.addListener(() => {
    controller.abort();
  });

  port.onMessage.addListener((message) => {
    if (used) {
      port.postMessage({ type: "error", error: "Stream port already used" });
      return;
    }

    used = true;
    void handleStreamRequest(port, message, controller.signal);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void sessionStore.revokeSessionsForTab(tabId);
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (approvalWindowId === windowId && currentApproval) {
    expireCurrentApproval();
  }
});
