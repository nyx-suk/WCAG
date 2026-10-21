import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, EVIDENCE_DIR } from "../engine/browser";
import { runKeyboardTrapCheck } from "../engine/checks/keyboardTrap";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";
import type { KeyboardTrapEvidence } from "../engine/types";

const PORT = 4095;
const BASE_URL = `http://localhost:${PORT}`;

test("keyboard trap check distinguishes genuine trap from accessible modal", async (t) => {
  const server = startFixtureServer(PORT);
  const browser = await launchBrowser();

  t.after(async () => {
    await browser.close();
    await stopFixtureServer(server);
  });

  // 1. TC1 Bad: Inescapable trap
  const badFindings = await runKeyboardTrapCheck({
    url: `${BASE_URL}/tc1/bad`,
    auditId: `test-tc1-bad-${Date.now()}`,
    browser,
  });

  assert.equal(badFindings.length, 1, "Should report exactly one finding for bad modal");
  const finding = badFindings[0];
  assert.equal(finding.title, "Keyboard trap in modal dialog");
  assert.equal(finding.wcagRule, "2.1.2 No Keyboard Trap");
  assert.equal(finding.severity, "critical");
  assert.equal(finding.source, "keyboard-trap");
  assert.equal(finding.checkId, "keyboard-trap");
  assert.match(finding.fingerprint, /^[0-9a-f]{16}$/);
  assert.ok(finding.screenshot);
  assert.ok(finding.recording);

  // Verify recording file exists on disk and is non-empty
  const recPath = path.join(EVIDENCE_DIR, finding.recording!);
  const recStat = await fs.stat(recPath);
  assert.ok(recStat.size > 0, "Video recording must be non-empty");

  const evidence = finding.evidence as KeyboardTrapEvidence;
  assert.equal(evidence.cycleDetected, true);
  assert.equal(evidence.cycleLength, 3);
  assert.equal(evidence.escapePressed, true);
  assert.equal(evidence.modalStillOpenAfterEscape, true);
  assert.equal(evidence.dismissControlsWorked, false);
  assert.ok(evidence.tabSequence.length > 3);

  // 2. TC1 Good: Accessible modal with Escape and button dismissal
  const goodFindings = await runKeyboardTrapCheck({
    url: `${BASE_URL}/tc1/good`,
    auditId: `test-tc1-good-${Date.now()}`,
    browser,
  });

  assert.equal(goodFindings.length, 0, "Should report 0 findings for accessible modal");
});
