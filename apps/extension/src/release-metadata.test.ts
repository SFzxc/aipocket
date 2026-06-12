import { describe, expect, test } from "vitest";

import manifest from "../public/manifest.json";
import { RELEASE_DOCS, RELEASE_ICON_SIZES, RELEASE_METADATA } from "./release-metadata";

describe("release metadata", () => {
  test("uses public AIPocket Chrome Store metadata", () => {
    expect(RELEASE_METADATA).toEqual({
      name: "AIPocket",
      version: "0.1.0",
      description: "Connect apps to your AI providers without exposing keys."
    });
  });

  test("declares required Chrome icon sizes", () => {
    expect(RELEASE_ICON_SIZES).toEqual([16, 32, 48, 128]);
  });

  test("declares required release docs", () => {
    expect(RELEASE_DOCS).toEqual([
      "docs/release/chrome-web-store.md",
      "docs/release/privacy-policy.md",
      "docs/release/permission-justifications.md",
      "docs/release/manual-test-plan.md"
    ]);
  });
});

describe("release manifest", () => {
  test("uses AIPocket public metadata", () => {
    expect(manifest.name).toBe(RELEASE_METADATA.name);
    expect(manifest.version).toBe(RELEASE_METADATA.version);
    expect(manifest.description).toBe(RELEASE_METADATA.description);
  });

  test("uses expected release permissions", () => {
    expect(manifest.permissions).toEqual(["storage", "tabs"]);
    expect(manifest.permissions).not.toContain("scripting");
  });

  test("declares required icon sizes", () => {
    expect(manifest.icons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    });
    expect(manifest.action.default_icon).toEqual(manifest.icons);
  });
});
