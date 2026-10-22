import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";
import { runAudit } from "../engine/runAudit";

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

test("runAudit records keyboard checks as unsupported", async (t) => {
  const server = startFixtureServer(port + 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));
  const result = await runAudit({
    auditId: "runner-tc4",
    url: `http://localhost:${port + 1}/tc4`,
    wcagLevel: "AA",
    checks: ["keyboard-operability"],
  });
  assert.equal(result.status, "incomplete");
  assert.equal(result.checksExecuted[0]?.status, "skipped");
  assert.match(result.checksExecuted[0]?.error ?? "", /Unsupported/);
});

test("runAudit produces a real contrast finding for TC3", async (t) => {
  const server = startFixtureServer(port + 2);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => stopFixtureServer(server));
  const result = await runAudit({
    auditId: "runner-tc3",
    url: `http://localhost:${port + 2}/tc3`,
    wcagLevel: "AA",
    checks: ["contrast"],
  });
  assert.equal(result.status, "complete");
  assert.equal(result.findings[0]?.source, "contrast");
  assert.equal(result.findings[0]?.wcagRule, "1.4.3 Contrast (Minimum)");
  assert.ok(result.findings[0]?.screenshot);
});
