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
