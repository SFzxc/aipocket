import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { RELEASE_DOCS } from "../src/release-metadata";

describe("release docs", () => {
  test("all required release docs exist", () => {
    for (const docPath of RELEASE_DOCS) {
      expect(existsSync(resolve(process.cwd(), "..", "..", docPath))).toBe(true);
    }
  });
});
