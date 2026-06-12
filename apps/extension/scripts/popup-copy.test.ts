import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(process.cwd(), "..", "..");
const popupHtml = readFileSync(resolve(repoRoot, "apps/extension/src/popup.html"), "utf8");

describe("popup copy", () => {
  test("removes redundant wallet explainer copy", () => {
    expect(popupHtml).not.toContain("AI Access Wallet");
    expect(popupHtml).not.toContain("Your API key stays inside this extension.");
    expect(popupHtml).not.toContain("Choose provider type, validate, then save.");
    expect(popupHtml).not.toContain("Only use endpoints you trust. Your API key is sent to this URL by the extension.");
    expect(popupHtml).not.toContain("Ready for website requests");
    expect(popupHtml).not.toContain("Connected sites");
  });

  test("models view is not hardcoded to one provider type", () => {
    expect(popupHtml).not.toContain("<h2 class=\"section-title\">OpenAI-compatible</h2>");
  });

  test("home uses compact control panel labels", () => {
    expect(popupHtml).toContain("<h2 class=\"wallet-title\">Ready</h2>");
    expect(popupHtml).toContain("<p>Providers <span id=\"provider-count\">No providers</span></p>");
    expect(popupHtml).toContain("<p>Sessions <span id=\"session-count\">0</span></p>");
    expect(popupHtml).toContain("<button class=\"button wallet-action\" id=\"provider-action\" type=\"button\">Add provider</button>");
  });

  test("providers view keeps list first and debug collapsed", () => {
    expect(popupHtml).not.toContain("provider-summary-strip");
    expect(popupHtml).not.toContain("wallet-section provider-management-section");
    expect(popupHtml.indexOf("id=\"providers-list\"")).toBeLessThan(popupHtml.indexOf("id=\"provider-form-slot-top\""));
    expect(popupHtml).toContain("<summary>Debug</summary>");
  });
});
