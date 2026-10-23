import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import { runAudit, buildAuditPlan } from "../engine/runAudit";

const port = 4140;
const baseUrl = `http://localhost:${port}`;

test("buildAuditPlan: creates human-readable rationale and planned checks", () => {
  const fullPlan = buildAuditPlan({
    url: "https://example.com",
    wcagLevel: "AA",
    auditId: "test-plan",
  }, { hasDialogs: true, hasImages: true });

  assert.equal(fullPlan.checks.length, 4);
  assert.ok(fullPlan.summary.includes("Comprehensive audit plan"));

  const trapCheck = fullPlan.checks.find((c) => c.checkId === "keyboard-trap");
  assert.ok(trapCheck);
  assert.match(trapCheck.reason, /dialog.*modal/i);

  const contrastCheck = fullPlan.checks.find((c) => c.checkId === "contrast");
  assert.ok(contrastCheck);
  assert.match(contrastCheck.reason, /image/i);

  // Retest isolation plan
  const retestPlan = buildAuditPlan({
    url: "https://example.com",
    wcagLevel: "AA",
    auditId: "test-retest-plan",
    checks: ["keyboard-operability"],
  });
  assert.equal(retestPlan.checks.length, 1);
  assert.ok(retestPlan.summary.includes("Isolated retest plan"));
});

test("runAudit: records plan, executed checks, checkDurations, and step log (§9.1)", async (t) => {
  resetFixtureState();
  const server = startFixtureServer(port);
  t.after(async () => stopFixtureServer(server));

  const result = await runAudit({
    auditId: "plan-audit-tc2",
    url: `${baseUrl}/tc2`,
    wcagLevel: "AA",
    checks: ["axe", "keyboard-operability"],
  });

  // Verify plan recorded
  assert.ok(result.plan, "AuditResult must contain plan");
  assert.ok(result.plan.summary.length > 0, "Plan summary must be populated");
  assert.equal(result.plan.checks.length, 2);
  assert.equal(result.plan.checks[0]?.checkId, "axe");
  assert.equal(result.plan.checks[1]?.checkId, "keyboard-operability");

  // Verify checksPlanned and checksExecuted recorded
  assert.deepEqual(result.checksPlanned, ["axe", "keyboard-operability"]);
  assert.equal(result.checksExecuted.length, 2);
  assert.equal(result.checksExecuted[0]?.checkId, "axe");
  assert.equal(result.checksExecuted[0]?.status, "executed");
  assert.equal(result.checksExecuted[1]?.checkId, "keyboard-operability");
  assert.equal(result.checksExecuted[1]?.status, "executed");

  // Verify checkDurations recorded
  assert.ok(result.checkDurations, "AuditResult must record checkDurations");
  assert.equal(typeof result.checkDurations.axe, "number");
  assert.equal(typeof result.checkDurations["keyboard-operability"], "number");
  assert.ok((result.checkDurations.axe ?? 0) >= 0);
  assert.ok((result.checkDurations["keyboard-operability"] ?? 0) >= 0);

  // Verify 4-step workflow log recorded
  assert.ok(result.steps, "AuditResult must contain steps log");
  const stepNames = result.steps.map((s) => s.step);
  assert.deepEqual(stepNames, ["collect", "plan", "find", "act"]);

  const collectStep = result.steps.find((s) => s.step === "collect");
  assert.equal(collectStep?.status, "complete");
  assert.match(collectStep?.summary || "", /Collected target URL/i);

  const planStep = result.steps.find((s) => s.step === "plan");
  assert.equal(planStep?.status, "complete");

  const findStep = result.steps.find((s) => s.step === "find");
  assert.equal(findStep?.status, "complete");
  assert.match(findStep?.summary || "", /Identified 1 finding/i);

  const actStep = result.steps.find((s) => s.step === "act");
  assert.equal(actStep?.status, "pending");
  assert.match(actStep?.summary || "", /Presenting 1 proposed finding/i);
});
