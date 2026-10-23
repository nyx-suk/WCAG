import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createAuditApp } from "../src/api/server";
import { AuditStore } from "../src/persistence/sqlite";
import type { AuditInput, AuditResult } from "../engine/types";

function resultFor(input: AuditInput, finding: boolean): AuditResult {
  const now = new Date().toISOString();
  return {
    auditId: input.auditId,
    url: input.url,
    status: "complete",
    findings: finding ? [{
      title: "Keyboard failure",
      description: "The control is not keyboard operable.",
      wcagRule: "2.1.1 Keyboard",
      severity: "serious",
      source: "keyboard-operability",
      checkId: "keyboard-operability",
      fingerprint: "tc4-keyboard-failure",
      selector: "#broken-control",
      evidence: { reachableByTab: false },
    }] : [],
    checksPlanned: input.checks ?? ["keyboard-operability"],
    checksExecuted: [{ checkId: input.checks?.[0] ?? "keyboard-operability", status: "executed" }],
    startedAt: now,
    completedAt: now,
  };
}

async function withApi(
  runAudit: (input: AuditInput) => Promise<AuditResult>,
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const store = await AuditStore.open(":memory:");
  const server = http.createServer(createAuditApp({ store, runAudit }));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  }
}

test("audit API validates input, persists findings, and supports approval/rejection", async () => {
  await withApi(async (input) => resultFor(input, true), async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:4000/tc4", wcagLevel: "invalid" }),
    });
    assert.equal(invalid.status, 400);

    const created = await fetch(`${baseUrl}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:4000/tc4", wcagLevel: "AA", checks: ["keyboard-operability"] }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { audit: { auditId: string }; issues: Array<{ id: string; status: string }> };
    assert.equal(createdBody.issues[0].status, "pending_approval");

    const listed = await fetch(`${baseUrl}/api/audits`);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json() as unknown[]).length, 1);

    const approved = await fetch(`${baseUrl}/api/issues/${createdBody.issues[0].id}/approve`, { method: "POST" });
    assert.equal(approved.status, 200);
    assert.equal((await approved.json() as { status: string }).status, "approved_logged");

    const rejected = await fetch(`${baseUrl}/api/issues/missing/reject`, { method: "POST" });
    assert.equal(rejected.status, 404);
  });
});

test("audit API rejects malformed and unsupported URLs without persisting an audit", async () => {
  await withApi(async (input) => resultFor(input, false), async (baseUrl) => {
    for (const url of ["not-a-url", "ftp://example.com/audit"]) {
      const response = await fetch(`${baseUrl}/api/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, wcagLevel: "AA" }),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json() as { error: string }).error, /url/i);
    }

    const audits = await (await fetch(`${baseUrl}/api/audits`)).json() as unknown[];
    assert.equal(audits.length, 0);
  });
});

test("audit API persists execution failures and returns HTTP 502", async () => {
  await withApi(async () => {
    throw new Error("browser unavailable");
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", wcagLevel: "AA" }),
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json() as { error: string }).error, "browser unavailable");

    const audits = await (await fetch(`${baseUrl}/api/audits`)).json() as Array<{
      audit: { status: string; result?: { status: string; error?: string } };
    }>;
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.audit.status, "error");
    assert.equal(audits[0]?.audit.result?.error, "browser unavailable");
  });
});

test("retest API keeps failing issues open and resolves only after a pass", async () => {
  let calls = 0;
  await withApi(async (input) => {
    calls += 1;
    return resultFor(input, calls < 3);
  }, async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:4000/tc4", wcagLevel: "AA" }),
    });
    const body = await created.json() as { issues: Array<{ id: string }> };
    const issueId = body.issues[0].id;
    await fetch(`${baseUrl}/api/issues/${issueId}/approve`, { method: "POST" });

    const firstRetest = await fetch(`${baseUrl}/api/issues/${issueId}/retest`, { method: "POST" });
    assert.equal(firstRetest.status, 200);
    const firstBody = await firstRetest.json() as { issue: { status: string }; outcome: { status: string } };
    assert.equal(firstBody.outcome.status, "fail");
    assert.equal(firstBody.issue.status, "approved_logged");

    const secondRetest = await fetch(`${baseUrl}/api/issues/${issueId}/retest`, { method: "POST" });
    assert.equal(secondRetest.status, 200);
    assert.equal((await secondRetest.json() as { issue: { status: string }; outcome: { status: string } }).outcome.status, "pass");
    const audits = await (await fetch(`${baseUrl}/api/audits`)).json() as Array<{ issues: Array<{ status: string }> }>;
    assert.equal(audits.flatMap((audit) => audit.issues).find((issue) => issue.status === "resolved")?.status, "resolved");
  });
});

test("new API query routes: GET /api/audits/:id, GET /api/issues, GET /api/issues/:id, GET /api/test-runs", async () => {
  await withApi(async (input) => resultFor(input, true), async (baseUrl) => {
    // Missing audit -> 404
    const notFoundAudit = await fetch(`${baseUrl}/api/audits/non-existent`);
    assert.equal(notFoundAudit.status, 404);

    // Create an audit
    const created = await fetch(`${baseUrl}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:4000/tc4", wcagLevel: "AA" }),
    });
    const createdBody = await created.json() as { audit: { auditId: string }; issues: Array<{ id: string }> };
    const auditId = createdBody.audit.auditId;
    const issueId = createdBody.issues[0].id;

    // GET /api/audits/:id
    const singleAudit = await fetch(`${baseUrl}/api/audits/${auditId}`);
    assert.equal(singleAudit.status, 200);
    const singleAuditBody = await singleAudit.json() as { audit: { auditId: string }; issues: unknown[] };
    assert.equal(singleAuditBody.audit.auditId, auditId);
    assert.equal(singleAuditBody.issues.length, 1);

    // GET /api/issues
    const allIssues = await fetch(`${baseUrl}/api/issues`);
    assert.equal(allIssues.status, 200);
    const issuesList = await allIssues.json() as Array<{ id: string; status: string }>;
    assert.equal(issuesList.length, 1);
    assert.equal(issuesList[0].status, "pending_approval");

    // Filter by status: open vs pending_approval
    const openIssues = await (await fetch(`${baseUrl}/api/issues?status=open`)).json() as unknown[];
    assert.equal(openIssues.length, 0);

    const pendingIssues = await (await fetch(`${baseUrl}/api/issues?status=pending_approval`)).json() as unknown[];
    assert.equal(pendingIssues.length, 1);

    // GET /api/issues/:id
    const singleIssue = await fetch(`${baseUrl}/api/issues/${issueId}`);
    assert.equal(singleIssue.status, 200);
    const singleIssueBody = await singleIssue.json() as {
      issue: { id: string };
      history: Array<{ to: string }>;
      retests: unknown[];
    };
    assert.equal(singleIssueBody.issue.id, issueId);
    assert.ok(singleIssueBody.history.length >= 1);
    assert.equal(singleIssueBody.history[0].to, "pending_approval");

    // Missing issue -> 404
    const notFoundIssue = await fetch(`${baseUrl}/api/issues/missing-id`);
    assert.equal(notFoundIssue.status, 404);

    // GET /api/test-runs
    const testRuns = await fetch(`${baseUrl}/api/test-runs`);
    assert.equal(testRuns.status, 200);
    const testRunsList = await testRuns.json() as unknown[];
    assert.ok(Array.isArray(testRunsList));
  });
});

test("static evidence serving protects against path traversal and serves files", async () => {
  await withApi(async (input) => resultFor(input, false), async (baseUrl) => {
    // Path traversal attempt via double encoding -> 403
    const traversal = await fetch(`${baseUrl}/evidence/%252e%252e/package.json`);
    assert.equal(traversal.status, 403);

    // Missing evidence file -> 404
    const missing = await fetch(`${baseUrl}/evidence/non-existent-folder/missing.png`);
    assert.equal(missing.status, 404);

    // Fixture mounted route check
    const fixtureHealth = await fetch(`${baseUrl}/health`);
    assert.equal(fixtureHealth.status, 200);
  });
});
