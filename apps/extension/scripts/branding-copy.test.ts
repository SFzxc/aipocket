import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(process.cwd(), "..", "..");
const checkedFiles = [
  "apps/demo-web/index.html",
  "apps/demo-web/src/App.tsx",
  "apps/extension/src/content-script.ts",
  "apps/extension/src/inpage-provider.ts",
  "apps/extension/src/popup.html"
];

const forbiddenPublicCopy = [
  "AI Wallet Demo",
  "Connect AI Wallet",
  "Disconnect AI Wallet",
  "Failed to connect AI Wallet",
  "Failed to disconnect AI Wallet",
  "Connect AI Wallet first",
  "AI Wallet stream failed",
  "AI Wallet request timed out",
  "AI Wallet stream timed out",
  "AI Wallet stream disconnected",
  "<title>AI Wallet</title>",
  "brand-title\">AI Wallet"
];

describe("public branding copy", () => {
  test("uses AIPocket in user-facing runtime copy", () => {
    const violations = checkedFiles.flatMap((filePath) => {
      const content = readFileSync(resolve(repoRoot, filePath), "utf8");
      return forbiddenPublicCopy.filter((copy) => content.includes(copy)).map((copy) => `${filePath}: ${copy}`);
    });

    expect(violations).toEqual([]);
  });
});
