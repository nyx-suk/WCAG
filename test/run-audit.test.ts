import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import { runAudit } from "../engine";

const port = 4101;
const baseUrl = `http://localhost:${port}`;

test("runAudit executes axe against the TC2 fixture", async (t) => {
  const server = startFixtureServer(port);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));
  const result = await runAudit({
    auditId: "runner-tc2",
    url: `${baseUrl}/tc2`,
    wcagLevel: "AA",
    checks: ["axe"],
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.checksExecuted, [{ checkId: "axe", status: "executed" }]);
  assert.equal(result.axeSummary?.violationCount, 0);
  assert.deepEqual(result.findings, []);
});

test("runAudit executes keyboard operability checks against TC2 broken", async (t) => {
  resetFixtureState();
  const server = startFixtureServer(port + 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));

  const result = await runAudit({
    auditId: "runner-tc2-operability",
    url: `http://localhost:${port + 1}/tc2`,
    wcagLevel: "AA",
    checks: ["keyboard-operability"],
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.checksExecuted, [{ checkId: "keyboard-operability", status: "executed" }]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.selector, "#add-to-cart");
  assert.equal(result.findings[0]?.source, "keyboard-operability");
  assert.equal(result.findings[0]?.wcagRule, "2.1.1 Keyboard");
});

test("runAudit executes keyboard trap check against TC1 bad", async (t) => {
  const server = startFixtureServer(port + 2);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));

  const result = await runAudit({
    auditId: "runner-tc1-trap",
    url: `http://localhost:${port + 2}/tc1/bad`,
    wcagLevel: "AA",
    checks: ["keyboard-trap"],
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.checksExecuted, [{ checkId: "keyboard-trap", status: "executed" }]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.source, "keyboard-trap");
  assert.equal(result.findings[0]?.wcagRule, "2.1.2 No Keyboard Trap");
  assert.ok(result.findings[0]?.recording);
});

test("runAudit produces a real contrast finding for TC3", async (t) => {
  const server = startFixtureServer(port + 3);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));
  const result = await runAudit({
    auditId: "runner-tc3",
    url: `http://localhost:${port + 3}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });
  assert.equal(result.status, "complete");
  assert.equal(result.findings[0]?.source, "contrast");
  assert.equal(result.findings[0]?.wcagRule, "1.4.3 Contrast (Minimum)");
  assert.ok(result.findings[0]?.screenshot);
});
