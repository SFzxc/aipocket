import { describe, expect, test } from "vitest";

import { getConnectionStatus } from "./demo-state";

describe("getConnectionStatus", () => {
  test("shows missing extension when provider is unavailable", () => {
    expect(getConnectionStatus({ hasProvider: false, isStreaming: false, isConnected: false })).toEqual({
      label: "Extension missing",
      tone: "warning"
    });
  });

  test("shows disconnected when provider exists without session", () => {
    expect(getConnectionStatus({ hasProvider: true, isStreaming: false, isConnected: false })).toEqual({ label: "Disconnected", tone: "neutral" });
  });

  test("shows connected for active session", () => {
    expect(getConnectionStatus({ hasProvider: true, isStreaming: false, isConnected: true })).toEqual({ label: "Connected", tone: "success" });
  });

  test("shows streaming while a request is active", () => {
    expect(getConnectionStatus({ hasProvider: true, isStreaming: true, isConnected: true })).toEqual({ label: "Streaming", tone: "active" });
  });
});
