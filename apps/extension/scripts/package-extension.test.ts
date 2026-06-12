import { describe, expect, test } from "vitest";

describe("package-extension script contract", () => {
  test("package script is wired in package.json", async () => {
    const packageJson = await import("../package.json");
    expect(packageJson.default.scripts.package).toBe("npm run build && node scripts/package-extension.mjs");
  });
});
