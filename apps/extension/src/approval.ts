import { filterModels, formatApprovalModelCount, getModelSelectionState, getProviderVisibleSelectionState } from "./ui-state";

const originEl = document.querySelector<HTMLSpanElement>("#origin");
const reasonEl = document.querySelector<HTMLSpanElement>("#reason");
const providerNameEl = document.querySelector<HTMLSpanElement>("#provider-name");
const providerTypeEl = document.querySelector<HTMLSpanElement>("#provider-type");
const requestLimitEl = document.querySelector<HTMLSpanElement>("#request-limit");
const modelsEl = document.querySelector<HTMLDivElement>("#models");
const modelCountEl = document.querySelector<HTMLSpanElement>("#model-count");
const approveButton = document.querySelector<HTMLButtonElement>("#approve");
const rejectButton = document.querySelector<HTMLButtonElement>("#reject");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const debugStatusEl = document.querySelector<HTMLSpanElement>("#debug-status");
const debugRequestIdEl = document.querySelector<HTMLSpanElement>("#debug-request-id");
const debugOriginEl = document.querySelector<HTMLSpanElement>("#debug-origin");
const debugModelsCountEl = document.querySelector<HTMLSpanElement>("#debug-models-count");
const debugErrorEl = document.querySelector<HTMLSpanElement>("#debug-error");

type ApprovalRequest = {
  id: string;
  origin: string;
  reason: string;
  providerId: string;
  providerName: string;
  providerType: string;
  requestLimit?: number;
  models: string[];
};

let request: ApprovalRequest | null = null;
let modelSearchQuery = "";
let selectedModelValues = new Set<string>();

function setStatus(message: string, variant: "neutral" | "error" = "neutral") {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", variant === "error");
  }
}

function setDebug(status: string, error = "") {
  if (debugStatusEl) {
    debugStatusEl.textContent = status;
  }
  if (debugRequestIdEl) {
    debugRequestIdEl.textContent = request?.id ?? "-";
  }
  if (debugOriginEl) {
    debugOriginEl.textContent = request?.origin ?? "-";
  }
  if (debugModelsCountEl) {
    debugModelsCountEl.textContent = String(request?.models.length ?? 0);
  }
  if (debugErrorEl) {
    debugErrorEl.textContent = error || "-";
  }
}

function parseRequestFromUrl(): ApprovalRequest | null {
  const rawRequest = new URLSearchParams(window.location.search).get("request");
  if (!rawRequest) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawRequest) as ApprovalRequest;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.origin === "string" &&
      typeof parsed.reason === "string" &&
      typeof parsed.providerId === "string" &&
      typeof parsed.providerName === "string" &&
      typeof parsed.providerType === "string" &&
      (parsed.requestLimit === undefined || typeof parsed.requestLimit === "number") &&
      Array.isArray(parsed.models) &&
      parsed.models.every((model) => typeof model === "string")
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function selectedModels() {
  return [...document.querySelectorAll<HTMLInputElement>('input[name="model"]')]
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function updateModelSelectionState() {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[name="model"]')];
  selectedModelValues = new Set(inputs.filter((input) => input.checked).map((input) => input.value));
  const state = getModelSelectionState(inputs.map((input) => input.checked));
  const visibleInputs = inputs.filter((input) => input.closest<HTMLElement>(".model-option")?.hidden !== true);
  const providerInput = document.querySelector<HTMLInputElement>('#models input[data-role="provider-toggle"]');
  const providerState = getProviderVisibleSelectionState(visibleInputs.map((input) => input.checked));
  if (modelCountEl) {
    modelCountEl.textContent = formatApprovalModelCount(state.selected, state.total);
  }
  if (approveButton) {
    approveButton.disabled = !request || state.approveDisabled;
    approveButton.textContent = `Approve ${state.selected} ${state.selected === 1 ? "model" : "models"}`;
  }
  if (providerInput) {
    providerInput.checked = providerState.checked;
    providerInput.indeterminate = providerState.indeterminate;
  }
}

function renderModelRows() {
  if (!modelsEl || !request) {
    return;
  }

  modelsEl.replaceChildren();

  const providerHeader = document.createElement("label");
  providerHeader.className = "approval-provider-header";

  const providerToggle = document.createElement("input");
  providerToggle.type = "checkbox";
  providerToggle.dataset.role = "provider-toggle";
  providerToggle.addEventListener("change", () => {
    const visibleInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="model"]')].filter(
      (input) => input.closest<HTMLElement>(".model-option")?.hidden !== true
    );
    for (const input of visibleInputs) {
      input.checked = providerToggle.checked;
    }
    updateModelSelectionState();
  });

  const providerName = document.createElement("p");
  providerName.className = "approval-provider-name";
  providerName.textContent = request.providerName;

  providerHeader.append(providerToggle, providerName);
  modelsEl.appendChild(providerHeader);

  const tools = document.createElement("div");
  tools.className = "approval-model-tools";

  const actions = document.createElement("div");
  actions.className = "button-row";

  const selectRequestedButton = document.createElement("button");
  selectRequestedButton.className = "text-button";
  selectRequestedButton.type = "button";
  selectRequestedButton.textContent = "Select requested";
  selectRequestedButton.addEventListener("click", () => {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="model"]')) {
      input.checked = true;
    }
    updateModelSelectionState();
  });

  const clearButton = document.createElement("button");
  clearButton.className = "text-button danger-text";
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="model"]')) {
      input.checked = false;
    }
    updateModelSelectionState();
  });

  actions.append(selectRequestedButton, clearButton);
  tools.appendChild(actions);

  if (request.models.length > 10) {
    const searchLabel = document.createElement("label");
    searchLabel.className = "field approval-search-field";
    searchLabel.textContent = "Search";

    const searchInput = document.createElement("input");
    searchInput.className = "input";
    searchInput.type = "search";
    searchInput.placeholder = "Search model id";
    searchInput.autocomplete = "off";
    searchInput.value = modelSearchQuery;
    searchInput.addEventListener("input", () => {
      modelSearchQuery = searchInput.value;
      renderModelRows();
    });

    searchLabel.appendChild(searchInput);
    tools.appendChild(searchLabel);
  }

  modelsEl.appendChild(tools);

  const visibleModels = new Set(filterModels(request.models, modelSearchQuery));
  const list = document.createElement("div");
  list.className = "approval-scroll-list";

  for (const model of request.models) {
    const label = document.createElement("label");
    label.className = "model-option";
    label.hidden = !visibleModels.has(model);

    const input = document.createElement("input");
    input.name = "model";
    input.type = "checkbox";
    input.value = model;
    input.checked = selectedModelValues.has(model);
    input.addEventListener("change", updateModelSelectionState);

    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = model;

    label.append(input, name);
    list.appendChild(label);
  }

  modelsEl.appendChild(list);
  updateModelSelectionState();
}

async function loadRequest() {
  setDebug("loading");
  request = parseRequestFromUrl();
  if (!request) {
    try {
      request = await chrome.runtime.sendMessage({ type: "AI_WALLET_GET_APPROVAL_REQUEST" });
    } catch {
      request = null;
    }
  }

  if (!request) {
    approveButton?.setAttribute("disabled", "true");
    updateModelSelectionState();
    const error = "No pending approval request. Reload demo tab and click Connect again.";
    setDebug("failed", error);
    setStatus(error, "error");
    return;
  }

  approveButton?.removeAttribute("disabled");
  setDebug("loaded");

  if (originEl) {
    originEl.textContent = request.origin;
  }
  if (reasonEl) {
    reasonEl.textContent = request.reason;
  }
  if (providerNameEl) {
    providerNameEl.textContent = request.providerName;
  }
  if (providerTypeEl) {
    providerTypeEl.textContent = request.providerType;
  }
  if (requestLimitEl) {
    requestLimitEl.textContent = request.requestLimit === undefined ? "No limit" : `${request.requestLimit} requests/session`;
  }
  if (modelsEl) {
    modelSearchQuery = "";
    selectedModelValues = new Set(request.models);
    renderModelRows();
  }
}

approveButton?.addEventListener("click", async () => {
  if (!request) {
    return;
  }

  const models = selectedModels();
  if (models.length === 0) {
    setStatus("Select at least one model", "error");
    updateModelSelectionState();
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "AI_WALLET_APPROVAL_DECISION",
    payload: { id: request.id, approved: true, models }
  });
  if (response?.ok === false) {
    const error = response.error ?? "Approval failed";
    setDebug("failed", error);
    setStatus(error, "error");
    return;
  }
  window.close();
});

rejectButton?.addEventListener("click", async () => {
  if (!request) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "AI_WALLET_APPROVAL_DECISION",
    payload: { id: request.id, approved: false, models: [] }
  });
  if (response?.ok === false) {
    const error = response.error ?? "Reject failed";
    setDebug("failed", error);
    setStatus(error, "error");
    return;
  }
  window.close();
});

void loadRequest();

export {};
