import { DEFAULT_PROVIDER_ENDPOINTS, getProviderTypeLabel, migrateStoredProviders, PROVIDERS_STORAGE_KEY, type ProviderConfig, type ProviderType } from "./providers";
import {
  filterModels,
  formatProviderStats,
  formatRequestLimit,
  formatSessionUsage,
  getProvidersSummary,
  getWalletStatusLabel,
  statusClassesForVariant,
  type StatusVariant
} from "./ui-state";

const homeView = document.querySelector<HTMLElement>("#home-view");
const settingsView = document.querySelector<HTMLElement>("#settings-view");
const modelsView = document.querySelector<HTMLElement>("#models-view");
const openSettingsButton = document.querySelector<HTMLButtonElement>("#open-settings");
const providerActionButton = document.querySelector<HTMLButtonElement>("#provider-action");
const backHomeButton = document.querySelector<HTMLButtonElement>("#back-home");
const openModelsButton = document.querySelector<HTMLButtonElement>("#open-models");
const backFromModelsButton = document.querySelector<HTMLButtonElement>("#back-from-models");
const modelSearchInput = document.querySelector<HTMLInputElement>("#model-search");
const modelSearchField = document.querySelector<HTMLElement>("#model-search-field");
const modelsTotalEl = document.querySelector<HTMLSpanElement>("#models-total");
const modelFilterCountEl = document.querySelector<HTMLParagraphElement>("#model-filter-count");
const modelInventoryListEl = document.querySelector<HTMLDivElement>("#model-inventory-list");
const providerTypeInput = document.querySelector<HTMLSelectElement>("#provider-type");
const providerNameInput = document.querySelector<HTMLInputElement>("#provider-name");
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
const endpointInput = document.querySelector<HTMLInputElement>("#endpoint");
const endpointField = document.querySelector<HTMLElement>("#endpoint-field");
const requestLimitInput = document.querySelector<HTMLInputElement>("#request-limit");
const addProviderButton = document.querySelector<HTMLButtonElement>("#add-provider");
const providersListEl = document.querySelector<HTMLDivElement>("#providers-list");
const providerSummaryStripEl = document.querySelector<HTMLDivElement>("#provider-summary-strip");
const providerFormSlotTopEl = document.querySelector<HTMLDivElement>("#provider-form-slot-top");
const providerFormPanelEl = document.querySelector<HTMLElement>("#provider-form-panel");
const providerCountEl = document.querySelector<HTMLSpanElement>("#provider-count");
const checkButton = document.querySelector<HTMLButtonElement>("#check");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const walletStatusEl = document.querySelector<HTMLSpanElement>("#wallet-status");
const providerHostEl = document.querySelector<HTMLSpanElement>("#provider-host");
const providerModelCountEl = document.querySelector<HTMLSpanElement>("#provider-model-count");
const refreshSessionsButton = document.querySelector<HTMLButtonElement>("#refresh-sessions");
const sessionsEl = document.querySelector<HTMLDivElement>("#sessions");
const sessionCountEl = document.querySelector<HTMLSpanElement>("#session-count");

type PopupSession = { sessionId: string; origin: string; providerId?: string; models: string[]; expiresAt: string; requestLimit?: number; requestCount?: number };

let providers: ProviderConfig[] = [];
let checkedProvider: ProviderConfig | null = null;
let editingProviderId: string | null = null;

function allModels() {
  return providers.flatMap((provider) => provider.models);
}

function setStatus(message: string, variant: StatusVariant = "neutral") {
  if (statusEl) {
    statusEl.textContent = message;
    const classes = statusClassesForVariant(variant);
    statusEl.classList.toggle("is-success", classes.isSuccess);
    statusEl.classList.toggle("is-error", classes.isError);
  }
  if (walletStatusEl && variant !== "neutral") {
    walletStatusEl.textContent = getWalletStatusLabel(variant);
  }
}

function showView(view: "home" | "settings" | "models") {
  homeView?.classList.toggle("is-hidden", view !== "home");
  settingsView?.classList.toggle("is-hidden", view !== "settings");
  modelsView?.classList.toggle("is-hidden", view !== "models");
}

function renderModelInventory() {
  const models = allModels();
  const query = modelSearchInput?.value ?? "";
  const filtered = filterModels(models, query);
  if (modelsTotalEl) modelsTotalEl.textContent = String(models.length);
  modelSearchField?.classList.toggle("is-hidden", models.length <= 8);
  if (modelFilterCountEl) modelFilterCountEl.textContent = query ? `Showing ${filtered.length} of ${models.length}` : "";
  if (!modelInventoryListEl) return;
  modelInventoryListEl.replaceChildren();
  if (models.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact-empty";
    empty.textContent = "No models saved. Run Check connection.";
    modelInventoryListEl.append(empty);
    return;
  }
  for (const model of filtered) {
    const row = document.createElement("div");
    row.className = "model-inventory-row";
    row.textContent = model;
    modelInventoryListEl.append(row);
  }
}

function updateEndpointDefault() {
  const type = (providerTypeInput?.value ?? "openai-compatible") as ProviderType;
  endpointField?.classList.toggle("is-hidden", type === "gemini");
  if (endpointInput && !endpointInput.value) endpointInput.value = DEFAULT_PROVIDER_ENDPOINTS[type] ?? "";
  if (providerNameInput && !providerNameInput.value) providerNameInput.value = getProviderTypeLabel(type);
}

function clearCheck() {
  checkedProvider = null;
  if (saveButton) saveButton.disabled = true;
}

function providerTypeInitial(type: ProviderType) {
  return { "openai-compatible": "O", "anthropic-compatible": "A", openrouter: "R", gemini: "G" }[type];
}

function endpointHost(provider: ProviderConfig) {
  if (!provider.endpoint) {
    return "Default endpoint";
  }
  try {
    return new URL(provider.endpoint).hostname;
  } catch {
    return "Custom endpoint";
  }
}

function renderProviderRow(provider: ProviderConfig) {
  const card = document.createElement("article");
  card.className = "provider-card-row";
  card.dataset.providerId = provider.id;

  const main = document.createElement("div");
  main.className = "provider-card-main";

  const badge = document.createElement("div");
  badge.className = `provider-type-badge provider-type-${provider.type}`;
  badge.textContent = providerTypeInitial(provider.type);

  const content = document.createElement("div");
  content.className = "provider-card-content";

  const titleRow = document.createElement("div");
  titleRow.className = "provider-card-title-row";
  const name = document.createElement("p");
  name.className = "provider-list-name";
  name.textContent = provider.name;
  const status = document.createElement("span");
  status.className = `provider-status-pill ${provider.enabled ? "is-enabled" : "is-disabled"}`;
  status.textContent = provider.enabled ? "Enabled" : "Disabled";
  titleRow.append(name, status);

  const typeLabel = document.createElement("p");
  typeLabel.className = "provider-card-type";
  typeLabel.textContent = getProviderTypeLabel(provider.type);

  const chips = document.createElement("div");
  chips.className = "provider-meta-chips";
  for (const label of [`${provider.models.length} models`, formatRequestLimit(provider.requestLimit), endpointHost(provider)]) {
    const chip = document.createElement("span");
    chip.className = "meta-chip";
    chip.textContent = label;
    chips.append(chip);
  }

  content.append(titleRow, typeLabel, chips);
  main.append(badge, content);

  const actions = document.createElement("div");
  actions.className = "provider-card-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "compact-action-button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => startEdit(provider));
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "compact-action-button";
  toggle.textContent = provider.enabled ? "Disable" : "Enable";
  toggle.addEventListener("click", async () => {
    providers = providers.map((item) => (item.id === provider.id ? { ...item, enabled: !item.enabled } : item));
    await saveProviders();
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "compact-action-button danger-action";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    providers = providers.filter((item) => item.id !== provider.id);
    await saveProviders();
  });
  actions.append(edit, toggle, remove);
  card.append(main, actions);
  if (editingProviderId === provider.id && providerFormPanelEl) {
    card.append(providerFormPanelEl);
  }
  return card;
}

function renderProviders() {
  const summary = getProvidersSummary(providers);
  const totalModels = allModels().length;
  const enabledCount = providers.filter((provider) => provider.enabled).length;
  if (providerSummaryStripEl) {
    providerSummaryStripEl.textContent = formatProviderStats({ total: providers.length, enabled: enabledCount, models: totalModels });
  }
  if (walletStatusEl) {
    walletStatusEl.textContent = summary.statusLabel;
    walletStatusEl.classList.toggle("is-ready", summary.statusLabel === "Ready");
  }
  if (providerCountEl) providerCountEl.textContent = summary.providerCountLabel;
  if (providerModelCountEl) providerModelCountEl.textContent = providers.length === 0 ? "None saved" : `${totalModels} available`;
  if (providerHostEl) providerHostEl.textContent = providers.length === 0 ? "Not configured" : `${enabledCount} enabled`;
  if (providerActionButton) providerActionButton.textContent = providers.length === 0 ? "Set up provider" : "Manage providers";
  providersListEl?.replaceChildren(...providers.map(renderProviderRow));
}

async function saveProviders() {
  await chrome.storage.local.set({ [PROVIDERS_STORAGE_KEY]: providers });
  providerFormPanelEl?.classList.add("is-hidden");
  editingProviderId = null;
  renderProviders();
}

function startEdit(provider: ProviderConfig | null = null) {
  editingProviderId = provider?.id ?? null;
  checkedProvider = null;
  if (saveButton) saveButton.disabled = true;
  if (providerTypeInput) providerTypeInput.value = provider?.type ?? "openai-compatible";
  if (providerNameInput) providerNameInput.value = provider?.name ?? "";
  if (apiKeyInput) apiKeyInput.value = provider?.apiKey ?? "";
  if (endpointInput) endpointInput.value = provider?.endpoint ?? "";
  if (requestLimitInput) requestLimitInput.value = provider?.requestLimit ? String(provider.requestLimit) : "";
  updateEndpointDefault();
  providerFormPanelEl?.classList.remove("is-hidden");
  if (provider && providerFormPanelEl) {
    document.querySelector(`[data-provider-id="${provider.id}"]`)?.append(providerFormPanelEl);
  } else if (providerFormPanelEl) {
    providerFormSlotTopEl?.append(providerFormPanelEl);
  }
  setStatus(provider ? "Editing provider. Run Check before Save." : "Add provider. Run Check before Save.");
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([PROVIDERS_STORAGE_KEY, "openAiApiKey", "aiServiceEndpoint", "aiWalletAvailableModels"]);
  providers = migrateStoredProviders(stored);
  renderProviders();
  providerFormPanelEl?.classList.add("is-hidden");
}

function renderSessions(sessions: PopupSession[]) {
  if (!sessionsEl) return;
  sessionsEl.replaceChildren();
  if (sessionCountEl) sessionCountEl.textContent = String(sessions.length);
  if (sessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact-empty";
    empty.textContent = "No websites connected";
    sessionsEl.append(empty);
    return;
  }
  for (const session of sessions) {
    const article = document.createElement("article");
    article.className = "connected-site-card";
    const body = document.createElement("div");
    body.className = "connected-site-body";
    const origin = document.createElement("p");
    origin.className = "connected-site-origin";
    origin.textContent = session.origin;
    const meta = document.createElement("p");
    meta.className = "connected-site-meta";
    meta.textContent = `${session.providerId ?? "provider"} · ${session.models.length} ${session.models.length === 1 ? "model" : "models"} · ${formatSessionUsage(session.requestCount, session.requestLimit)}`;
    body.append(origin, meta);
    const revokeButton = document.createElement("button");
    revokeButton.type = "button";
    revokeButton.className = "compact-action-button danger-action connected-site-revoke";
    revokeButton.textContent = "Revoke";
    revokeButton.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "AI_WALLET_REVOKE_SESSION", payload: { sessionId: session.sessionId } });
      await loadSessions();
    });
    article.append(body, revokeButton);
    sessionsEl.append(article);
  }
}

async function loadSessions() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "AI_WALLET_LIST_SESSIONS" });
    renderSessions(Array.isArray(response?.sessions) ? response.sessions : []);
  } catch {
    renderSessions([]);
  }
}

providerTypeInput?.addEventListener("change", () => {
  clearCheck();
  if (endpointInput) endpointInput.value = "";
  if (providerNameInput) providerNameInput.value = "";
  updateEndpointDefault();
});
for (const input of [providerNameInput, apiKeyInput, endpointInput, requestLimitInput]) input?.addEventListener("input", clearCheck);
openSettingsButton?.addEventListener("click", () => showView("settings"));
providerActionButton?.addEventListener("click", () => showView("settings"));
backHomeButton?.addEventListener("click", () => showView("home"));
addProviderButton?.addEventListener("click", () => startEdit(null));
openModelsButton?.addEventListener("click", () => { renderModelInventory(); showView("models"); });
backFromModelsButton?.addEventListener("click", () => showView("home"));
modelSearchInput?.addEventListener("input", renderModelInventory);
refreshSessionsButton?.addEventListener("click", () => void loadSessions());

checkButton?.addEventListener("click", async () => {
  setStatus("Checking provider...");
  clearCheck();
  try {
    const response = await chrome.runtime.sendMessage({
      type: "AI_WALLET_CHECK_SETTINGS",
      payload: {
        id: editingProviderId ?? undefined,
        type: providerTypeInput?.value,
        name: providerNameInput?.value ?? "",
        apiKey: apiKeyInput?.value ?? "",
        endpoint: endpointInput?.value ?? "",
        requestLimit: requestLimitInput?.value ?? ""
      }
    });
    if (!response?.ok) {
      setStatus(response?.error ?? "Check failed", "error");
      return;
    }
    checkedProvider = response.provider;
    if (saveButton) saveButton.disabled = false;
    setStatus("Check passed. Save is enabled.", "success");
  } catch {
    setStatus("Provider check failed", "error");
  }
});

saveButton?.addEventListener("click", async () => {
  if (!checkedProvider) {
    setStatus("Run Check before Save", "error");
    return;
  }
  providers = providers.some((provider) => provider.id === checkedProvider?.id)
    ? providers.map((provider) => (provider.id === checkedProvider?.id ? checkedProvider : provider))
    : [...providers, checkedProvider];
  await saveProviders();
  setStatus("Saved", "success");
});

void loadSettings();
void loadSessions();

export {};
