import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(process.cwd(), "..", "..");
const packageFiles = [
  "package.json",
  "apps/demo-web/package.json",
  "apps/extension/package.json",
  "packages/connect-modal/package.json",
  "packages/protocol/package.json",
  "tsconfig.base.json"
];

describe("package namespace", () => {
  test("uses @aipocket package scope", () => {
    const violations = packageFiles.flatMap((filePath) => {
      const content = readFileSync(resolve(repoRoot, filePath), "utf8");
      return content.includes("@ai-wallet") ? [filePath] : [];
    });

    expect(violations).toEqual([]);
  });
});
