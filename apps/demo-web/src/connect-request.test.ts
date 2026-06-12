import { describe, expect, test } from "vitest";

import { buildConnectRequest } from "./connect-request";

describe("buildConnectRequest", () => {
  test("omits provider id when the demo field is empty", () => {
    expect(buildConnectRequest({ providerId: "", models: ["gpt-4.1-mini"] })).toEqual({
      models: ["gpt-4.1-mini"],
      reason: "Demo conversation needs AI response access"
    });
  });

  test("keeps provider id when the demo field is set", () => {
    expect(buildConnectRequest({ providerId: " provider_custom ", models: ["gpt-4.1-mini"] })).toEqual({
      providerId: "provider_custom",
      models: ["gpt-4.1-mini"],
      reason: "Demo conversation needs AI response access"
    });
  });
});
