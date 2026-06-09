export type StatusVariant = "neutral" | "success" | "error";

import type { ProviderConfig } from "./providers";

export function getWalletStatusLabel(variant: StatusVariant) {
  return variant === "success" ? "Ready" : "Setup";
}

export function statusClassesForVariant(variant: StatusVariant) {
  return { isSuccess: variant === "success", isError: variant === "error" };
}

export function getModelSelectionState(selectedStates: boolean[]) {
  const selected = selectedStates.filter(Boolean).length;
  return { selected, total: selectedStates.length, approveDisabled: selected === 0 };
}

export type ProviderSummaryInput = {
  apiKey: string;
  endpoint: string;
  models: string[];
};

export type ProviderSummary = {
  status: "ready" | "setup-required";
  statusLabel: string;
  hostLabel: string;
  modelCountLabel: string;
  actionLabel: string;
};

export function getProviderSummary(input: ProviderSummaryInput): ProviderSummary {
  const configured = input.apiKey.trim().length > 0;
  const modelCount = input.models.length;

  if (!configured) {
    return {
      status: "setup-required",
      statusLabel: "Setup required",
      hostLabel: "Not configured",
      modelCountLabel: "None saved",
      actionLabel: "Set up provider"
    };
  }

  let hostLabel = "Custom endpoint";
  try {
    hostLabel = new URL(input.endpoint).hostname || hostLabel;
  } catch {
    hostLabel = "Custom endpoint";
  }

  return {
    status: "ready",
    statusLabel: "Ready",
    hostLabel,
    modelCountLabel: modelCount === 1 ? "1 available" : `${modelCount} available`,
    actionLabel: "Ready for website requests"
  };
}

export function filterModels(models: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return models;
  }
  return models.filter((model) => model.toLowerCase().includes(normalizedQuery));
}

export function formatModelCount(count: number) {
  if (count === 0) {
    return "None saved";
  }
  return count === 1 ? "1 available" : `${count} available`;
}

export function formatApprovalModelCount(selected: number, total: number) {
  return `${selected} selected / ${total} available`;
}

export function getProviderVisibleSelectionState(selectedStates: boolean[]) {
  const selected = selectedStates.filter(Boolean).length;
  return {
    checked: selectedStates.length > 0 && selected === selectedStates.length,
    indeterminate: selected > 0 && selected < selectedStates.length
  };
}

export function getProvidersSummary(providers: ProviderConfig[]) {
  const enabled = providers.filter((provider) => provider.enabled);
  return {
    statusLabel: enabled.length > 0 ? "Ready" : "Setup required",
    providerCountLabel: providers.length === 0 ? "No providers" : `${providers.length} ${providers.length === 1 ? "provider" : "providers"}`
  };
}

export function formatRequestLimit(limit: number | undefined) {
  if (limit === undefined) {
    return "No limit";
  }
  return `${limit} ${limit === 1 ? "request" : "requests"}/session`;
}

export function formatProviderStats(input: { total: number; enabled: number; models: number }) {
  if (input.total === 0) {
    return "No providers yet";
  }
  return `${input.total} ${input.total === 1 ? "provider" : "providers"} · ${input.enabled} enabled · ${input.models} models`;
}

export function formatSessionUsage(count: number | undefined, limit: number | undefined) {
  const used = count ?? 0;
  if (limit === undefined) {
    return used === 0 ? "No limit" : `${used} ${used === 1 ? "request" : "requests"} used`;
  }
  return `${used}/${limit} requests`;
}
