import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import { runAudit } from "../engine";
import {
  setContrastModulePath,
  setContrastModuleStub,
  resetContrastModulePath,
} from "../engine/runAudit";

const port = 4111;
const baseUrl = `http://localhost:${port}`;

test("contrast check: missing module skips with exact error and allows remaining checks to run", async (t) => {
  const server = startFixtureServer(port);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetContrastModulePath();
    await stopFixtureServer(server);
  });

  resetFixtureState(); // tc2 broken state

  // Point to a nonexistent module path
  setContrastModulePath("./nonexistent-contrast-module");

  const result = await runAudit({
    auditId: "runner-missing-contrast",
    url: `${baseUrl}/tc2`,
    wcagLevel: "AA",
    checks: ["axe", "contrast", "keyboard-operability"],
  });

  // 1. Overall status must be "incomplete" due to skipped check
  assert.equal(result.status, "incomplete");

  // 2. Contrast must be recorded as skipped with exact error message
  const contrastExec = result.checksExecuted.find((c) => c.checkId === "contrast");
  assert.deepEqual(contrastExec, {
    checkId: "contrast",
    status: "skipped",
    error: "contrast module not available",
  });

  // 3. Axe and keyboard-operability must still execute
  const axeExec = result.checksExecuted.find((c) => c.checkId === "axe");
  assert.equal(axeExec?.status, "executed");

  const operabilityExec = result.checksExecuted.find((c) => c.checkId === "keyboard-operability");
  assert.equal(operabilityExec?.status, "executed");

  // 4. Keyboard operability finding must still be captured
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.selector, "#add-to-cart");
  assert.equal(result.findings[0]?.wcagRule, "2.1.1 Keyboard");
});

test("contrast check: module missing expected exports skips with exact error", async (t) => {
  const server = startFixtureServer(port + 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetContrastModulePath();
    await stopFixtureServer(server);
  });

  // Stub module with an empty object (no sampleContrast or runContrastCheck export)
  setContrastModuleStub({});

  const result = await runAudit({
    auditId: "runner-missing-exports",
    url: `http://localhost:${port + 1}/tc2`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });

  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.checksExecuted, [
    {
      checkId: "contrast",
      status: "skipped",
      error: "contrast module not available",
    },
  ]);
});

test("contrast check: runtime execution failure marks check as failed with thrown message", async (t) => {
  const server = startFixtureServer(port + 2);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    resetContrastModulePath();
    await stopFixtureServer(server);
  });

  // Stub module with a function that throws at runtime
  setContrastModuleStub({
    sampleContrast: async () => {
      throw new Error("Pixel sampling algorithm failed on corrupted buffer");
    },
  });

  const result = await runAudit({
    auditId: "runner-throwing-contrast",
    url: `http://localhost:${port + 2}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });

  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.checksExecuted, [
    {
      checkId: "contrast",
      status: "failed",
      error: "Pixel sampling algorithm failed on corrupted buffer",
    },
  ]);
  assert.equal(result.findings.length, 0);
});

test("contrast check: real TC3 contrast check passes with default module", async (t) => {
  resetContrastModulePath();
  const server = startFixtureServer(port + 3);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));

  const result = await runAudit({
    auditId: "runner-real-tc3-contrast",
    url: `http://localhost:${port + 3}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });

  assert.equal(result.status, "complete");
  assert.deepEqual(result.checksExecuted, [
    {
      checkId: "contrast",
      status: "executed",
    },
  ]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.source, "contrast");
  assert.equal(result.findings[0]?.wcagRule, "1.4.3 Contrast (Minimum)");
  assert.ok(result.findings[0]?.screenshot);
});
