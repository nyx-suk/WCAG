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
