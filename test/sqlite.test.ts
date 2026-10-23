import test from "node:test";
import assert from "node:assert/strict";
import { AuditStore } from "../src/persistence/sqlite";

test("persists findings and only resolves an approved issue after a passing retest", async () => {
  const store = await AuditStore.open(":memory:");
  const startedAt = "2026-10-21T00:00:00.000Z";
  store.createAudit({ auditId: "audit-1", url: "http://localhost:4000/tc4", wcagLevel: "AA" }, startedAt);
  store.saveAuditResult({
    auditId: "audit-1",
    url: "http://localhost:4000/tc4",
    status: "complete",
    findings: [{
      title: "Keyboard failure",
      description: "Control cannot be operated by keyboard.",
      wcagRule: "2.1.1 Keyboard",
      severity: "serious",
      source: "keyboard-operability",
      checkId: "keyboard-operability",
      fingerprint: "stable-finding",
      selector: "#broken-control",
      evidence: { reachableByTab: false },
    }],
    checksPlanned: ["keyboard-operability"],
    checksExecuted: [{ checkId: "keyboard-operability", status: "executed" }],
    startedAt,
    completedAt: "2026-10-21T00:01:00.000Z",
  });

  const issueId = "fnd_stable-finding";
  assert.equal(store.getIssue(issueId)?.status, "pending_approval");
  store.updateIssueStatus(issueId, "approved_logged");
  store.createAudit({ auditId: "audit-2", url: "http://localhost:4000/tc4", wcagLevel: "AA" });
  const failedRetest = store.recordRetest(issueId, "audit-2", { status: "fail", evidence: { passed: false } });
  assert.match(failedRetest, /^rst_/);
  assert.equal(store.getIssue(issueId)?.status, "approved_logged");
  store.createAudit({ auditId: "audit-3", url: "http://localhost:4000/tc4", wcagLevel: "AA" });
  store.recordRetest(issueId, "audit-3", { status: "pass", evidence: { passed: true } });
  assert.equal(store.getIssue(issueId)?.status, "resolved");
  store.close();
});

test("rejects resolving an issue without a passing retest", async () => {
  const store = await AuditStore.open(":memory:");
  assert.throws(() => store.updateIssueStatus("missing", "resolved"), /was not found/);
  store.close();
});

test("AuditStore: records and retrieves test runs matching PRD schema", async () => {
  const store = await AuditStore.open(":memory:");
  const testRun = {
    id: "tr_tc1_123456",
    test_case: "TC1" as const,
    input: { url: "http://localhost:4000/tc1/bad", wcagLevel: "AA" as const },
    expected_result: "Modal trap detected",
    actual_result: "1 critical finding",
    evidence: { recording: "tc1/keyboard-trap.webm" },
    status: "pass" as const,
    explanation: null,
    started_at: "2026-10-23T00:00:00.000Z",
    completed_at: "2026-10-23T00:00:05.000Z",
  };

  store.recordTestRun(testRun);
  const fetched = store.getTestRun("tr_tc1_123456");
  assert.ok(fetched);
  assert.equal(fetched.id, testRun.id);
  assert.equal(fetched.test_case, "TC1");
  assert.equal(fetched.status, "pass");
  assert.deepEqual(fetched.input, testRun.input);

  const byCase = store.getTestRun("TC1");
  assert.ok(byCase);
  assert.equal(byCase.id, testRun.id);

  const list = store.listTestRuns();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, testRun.id);

  const tc4Run = {
    id: "tr_tc4_lifecycle",
    test_case: "TC4" as const,
    input: { url: "http://localhost:4000/tc4", wcagLevel: "AA" as const },
    expected_result: "Initial failure detected and resolved upon retest",
    actual_result: "Issue resolved",
    evidence: { issueStatus: "resolved" },
    status: "pass" as const,
    explanation: "Initial page had real failure; retest resolved after fix.",
    started_at: "2026-10-23T01:00:00.000Z",
    completed_at: "2026-10-23T01:00:10.000Z",
  };
  store.recordTestRun(tc4Run);
  const fetchedTc4 = store.getTestRun("TC4");
  assert.ok(fetchedTc4);
  assert.equal(fetchedTc4.id, tc4Run.id);
  assert.equal(fetchedTc4.status, "pass");
  assert.equal(store.listTestRuns().length, 2);

  store.close();
});
