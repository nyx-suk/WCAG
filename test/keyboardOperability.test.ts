import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, EVIDENCE_DIR } from "../engine/browser";
import { runKeyboardOperabilityCheck } from "../engine/checks/keyboardOperability";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import type { KeyboardOperabilityEvidence } from "../engine/types";

const PORT = 4094;
const BASE_URL = `http://localhost:${PORT}`;

test("keyboard operability check flags inaccessible custom div buttons and passes native buttons", async (t) => {
  resetFixtureState();
  const server = startFixtureServer(PORT);
  const browser = await launchBrowser();

  t.after(async () => {
    await browser.close();
    await stopFixtureServer(server);
  });

  // 1. Broken State: <div id="add-to-cart">
  await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed: false }),
  });

  const brokenFindings = await runKeyboardOperabilityCheck({
    url: `${BASE_URL}/tc2`,
    auditId: `test-tc2-broken-${Date.now()}`,
    browser,
  });

  assert.equal(brokenFindings.length, 1, "Should report exactly 1 finding for custom div button");
  const finding = brokenFindings[0];
  assert.equal(finding.title, "Custom control is not keyboard operable");
  assert.equal(finding.wcagRule, "2.1.1 Keyboard");
  assert.equal(finding.severity, "serious");
  assert.equal(finding.source, "keyboard-operability");
  assert.equal(finding.checkId, "keyboard-operability");
  assert.equal(finding.selector, "#add-to-cart");
  assert.match(finding.fingerprint, /^[0-9a-f]{16}$/);
  assert.ok(finding.screenshot);
  assert.ok(finding.recording);

  // Verify screenshot and recording exist on disk
  const screenStat = await fs.stat(path.join(EVIDENCE_DIR, finding.screenshot!));
  assert.ok(screenStat.size > 0);
  const recStat = await fs.stat(path.join(EVIDENCE_DIR, finding.recording!));
  assert.ok(recStat.size > 0);

  const evidence = finding.evidence as KeyboardOperabilityEvidence;
  assert.equal(evidence.selector, "#add-to-cart");
  assert.equal(evidence.cursorPointer, true);
  assert.equal(evidence.hasClickHandler, true);
  assert.equal(evidence.reachableByTab, false);
  assert.equal(evidence.enterActivated, false);
  assert.equal(evidence.spaceActivated, false);
  assert.ok(evidence.tabsPressed > 0);

  // 2. Fixed State: <button id="add-to-cart">
  await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed: true }),
  });

  const fixedFindings = await runKeyboardOperabilityCheck({
    url: `${BASE_URL}/tc2`,
    auditId: `test-tc2-fixed-${Date.now()}`,
    browser,
  });

  assert.equal(fixedFindings.length, 0, "Should report 0 findings for native accessible button");
});
