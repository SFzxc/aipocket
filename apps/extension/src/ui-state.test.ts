import { describe, expect, test } from "vitest";

import {
  filterModels,
  formatApprovalModelCount,
  formatModelCount,
  formatProviderStats,
  formatRequestLimit,
  formatSessionUsage,
  getModelSelectionState,
  getProviderSummary,
  getProviderVisibleSelectionState,
  getProvidersSummary,
  getWalletStatusLabel,
  statusClassesForVariant
} from "./ui-state";

describe("ui-state", () => {
  test("maps success variant to ready wallet status", () => {
    expect(getWalletStatusLabel("success")).toBe("Ready");
    expect(getWalletStatusLabel("neutral")).toBe("Setup");
    expect(getWalletStatusLabel("error")).toBe("Setup");
  });

  test("maps status variants to CSS classes", () => {
    expect(statusClassesForVariant("success")).toEqual({ isSuccess: true, isError: false });
    expect(statusClassesForVariant("error")).toEqual({ isSuccess: false, isError: true });
    expect(statusClassesForVariant("neutral")).toEqual({ isSuccess: false, isError: false });
  });

  test("counts selected models and disables approve when none are selected", () => {
    expect(getModelSelectionState([true, false, true])).toEqual({ selected: 2, total: 3, approveDisabled: false });
    expect(getModelSelectionState([false, false])).toEqual({ selected: 0, total: 2, approveDisabled: true });
  });

  test("summarizes unconfigured provider for wallet home", () => {
    expect(getProviderSummary({ apiKey: "", endpoint: "https://api.openai.com/v1", models: [] })).toEqual({
      status: "setup-required",
      statusLabel: "Setup required",
      hostLabel: "Not configured",
      modelCountLabel: "None saved",
      actionLabel: "Add provider"
    });
  });

  test("summarizes configured provider for wallet home", () => {
    expect(
      getProviderSummary({
        apiKey: "sk-test",
        endpoint: "https://api.openai.com/v1/responses",
        models: ["gpt-4.1-mini", "gpt-4.1", "o4-mini"]
      })
    ).toEqual({
      status: "ready",
      statusLabel: "Ready",
      hostLabel: "api.openai.com",
      modelCountLabel: "3 available",
      actionLabel: "Providers"
    });
  });

  test("handles invalid configured endpoint host for wallet home", () => {
    expect(getProviderSummary({ apiKey: "sk-test", endpoint: "not a url", models: ["gpt-4.1-mini"] })).toEqual({
      status: "ready",
      statusLabel: "Ready",
      hostLabel: "Custom endpoint",
      modelCountLabel: "1 available",
      actionLabel: "Providers"
    });
  });

  test("filters models by lowercase query", () => {
    expect(filterModels(["gpt-4.1-mini", "claude-sonnet", "o4-mini"], "mini")).toEqual(["gpt-4.1-mini", "o4-mini"]);
  });

  test("formats model list count labels", () => {
    expect(formatModelCount(0)).toBe("None saved");
    expect(formatModelCount(1)).toBe("1 available");
    expect(formatModelCount(12)).toBe("12 available");
  });

  test("formats approval selected count", () => {
    expect(formatApprovalModelCount(3, 12)).toBe("3 selected / 12 available");
  });

  test("checks provider checkbox when all visible models are selected", () => {
    expect(getProviderVisibleSelectionState([true, true, true])).toEqual({ checked: true, indeterminate: false });
    expect(getProviderVisibleSelectionState([true, false, true])).toEqual({ checked: false, indeterminate: true });
    expect(getProviderVisibleSelectionState([false, false])).toEqual({ checked: false, indeterminate: false });
    expect(getProviderVisibleSelectionState([])).toEqual({ checked: false, indeterminate: false });
  });

  test("summarizes provider list", () => {
    expect(getProvidersSummary([])).toEqual({ statusLabel: "Setup required", providerCountLabel: "No providers" });
    expect(
      getProvidersSummary([
        { id: "provider_openai", type: "openai-compatible", name: "OpenAI", apiKey: "sk", models: ["gpt-4.1-mini"], enabled: true }
      ])
    ).toEqual({ statusLabel: "Ready", providerCountLabel: "1 provider" });
  });

  test("formats request limit", () => {
    expect(formatRequestLimit(undefined)).toBe("No limit");
    expect(formatRequestLimit(1)).toBe("1 request/session");
    expect(formatRequestLimit(5)).toBe("5 requests/session");
  });

  test("formats provider summary stats", () => {
    expect(formatProviderStats({ total: 0, enabled: 0, models: 0 })).toBe("No providers yet");
    expect(formatProviderStats({ total: 3, enabled: 2, models: 48 })).toBe("3 providers · 2 enabled · 48 models");
  });

  test("formats session usage", () => {
    expect(formatSessionUsage(undefined, undefined)).toBe("No limit");
    expect(formatSessionUsage(2, 5)).toBe("2/5 requests");
    expect(formatSessionUsage(1, undefined)).toBe("1 request used");
  });
});
