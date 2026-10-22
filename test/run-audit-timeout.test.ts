import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import {
  runAudit,
  setCheckTimeoutOverride,
  resetCheckTimeoutOverrides,
  setContrastModuleStub,
  resetContrastModulePath,
  AXE_TIMEOUT_MS,
  CONTRAST_TIMEOUT_MS,
} from "../engine/runAudit";

const port = 4121;

test("runAudit timeout constants are defined at 30 seconds", () => {
  assert.equal(AXE_TIMEOUT_MS, 30000);
  assert.equal(CONTRAST_TIMEOUT_MS, 30000);
});

test("runAudit timeout: slow axe check times out, marks failed with error, and runs later checks", async (t) => {
  const server = startFixtureServer(port);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetCheckTimeoutOverrides();
    await stopFixtureServer(server);
  });

  resetFixtureState(); // tc2 broken

  // Set an extremely short timeout (1ms) for axe so it reliably times out
  setCheckTimeoutOverride("axe", 1);

  const result = await runAudit({
    auditId: "timeout-axe-test",
    url: `http://localhost:${port}/tc2`,
    wcagLevel: "AA",
    checks: ["axe", "keyboard-operability"],
  });

  // 1. Overall status must be incomplete
  assert.equal(result.status, "incomplete");

  // 2. Axe check must be marked failed with message containing checkId and timeout
  const axeExec = result.checksExecuted.find((c) => c.checkId === "axe");
  assert.ok(axeExec, "axe check must be in checksExecuted");
  assert.equal(axeExec.status, "failed");
  assert.match(axeExec.error ?? "", /check 'axe' timed out after 1ms/i);

  // 3. Later checks (keyboard-operability) must still run and execute
  const operabilityExec = result.checksExecuted.find((c) => c.checkId === "keyboard-operability");
  assert.ok(operabilityExec, "keyboard-operability must be in checksExecuted");
  assert.equal(operabilityExec.status, "executed");

  // 4. Keyboard operability finding must be captured
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.selector, "#add-to-cart");
  assert.equal(result.findings[0]?.wcagRule, "2.1.1 Keyboard");
});

test("runAudit timeout: slow contrast check times out at 50ms, marks failed, and runs later checks", async (t) => {
  const server = startFixtureServer(port + 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetCheckTimeoutOverrides();
    resetContrastModulePath();
    await stopFixtureServer(server);
  });

  resetFixtureState();

  // Override contrast timeout to 50ms
  setCheckTimeoutOverride("contrast", 50);

  // Stub contrast sampler to simulate a slow 300ms execution
  setContrastModuleStub({
    sampleContrast: () => new Promise((resolve) => setTimeout(resolve, 300)),
  });

  const result = await runAudit({
    auditId: "timeout-contrast-test",
    url: `http://localhost:${port + 1}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast", "axe"],
  });

  // 1. Status must be incomplete
  assert.equal(result.status, "incomplete");

  // 2. Contrast must be marked failed with message containing checkId and timeout
  const contrastExec = result.checksExecuted.find((c) => c.checkId === "contrast");
  assert.ok(contrastExec, "contrast check must be in checksExecuted");
  assert.equal(contrastExec.status, "failed");
  assert.match(contrastExec.error ?? "", /check 'contrast' timed out after 50ms/i);

  // 3. Later checks (axe) must still run and execute
  const axeExec = result.checksExecuted.find((c) => c.checkId === "axe");
  assert.ok(axeExec, "axe must be in checksExecuted");
  assert.equal(axeExec.status, "executed");
});
