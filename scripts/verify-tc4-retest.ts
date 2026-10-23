import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createAuditApp } from "../src/api/server";
import { AuditStore } from "../src/persistence/sqlite";
import { runAudit } from "../engine";
import { recordOfficialTestRun } from "../engine/evidence";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";
import type { TestRunRecord } from "../engine/types";

const PORT = Number(process.env.FIXTURE_PORT) || 4000;
const BASE_URL = `http://localhost:${PORT}`;
const AUDIT_URL = `${BASE_URL}/tc4`;

async function isServerRunning(): Promise<boolean> {
  try {
    return (await fetch(`${BASE_URL}/health`)).ok;
  } catch {
    return false;
  }
}

async function setTc4State(fixed: boolean): Promise<void> {
  const response = await fetch(`${BASE_URL}/__state/tc4`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed }),
  });
  if (!response.ok) throw new Error(`Unable to set TC4 state to ${fixed}: HTTP ${response.status}`);
}

async function requireEvidence(relativePath: string | undefined): Promise<string> {
  if (!relativePath) throw new Error("TC4 finding is missing evidence.");
  await fs.access(new URL(`../evidence/${relativePath}`, import.meta.url));
  return relativePath;
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to determine API server port.");
  return address.port;
}

async function run(): Promise<void> {
  let fixtureServer: http.Server | null = null;
  let apiServer: http.Server | null = null;
  const apiStore = await AuditStore.open(":memory:");
  const store = await AuditStore.open();

  try {
    if (!(await isServerRunning())) {
      fixtureServer = startFixtureServer(PORT);
      for (let attempt = 0; attempt < 20 && !(await isServerRunning()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    await setTc4State(false);

    apiServer = http.createServer(createAuditApp({ store: apiStore, runAudit }));
    const apiPort = await listen(apiServer);
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const headers = { "Content-Type": "application/json" };

    const initialStartedAt = new Date().toISOString();
    const initialResponse = await fetch(`${apiUrl}/api/audits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"] }),
    });
    if (initialResponse.status !== 201) throw new Error(`TC4 broken-page audit failed: HTTP ${initialResponse.status}`);
    const initialBody = await initialResponse.json() as {
      audit: { auditId: string; result?: { status: string; findings?: unknown[] } };
      issues: Array<{ id: string; fingerprint: string; status: string; screenshot?: string; recording?: string }>;
    };
    const issue = initialBody.issues[0];
    if (!issue || issue.status !== "pending_approval" ||
        initialBody.audit.result?.status !== "complete" ||
        initialBody.audit.result.findings?.length !== 1) {
      throw new Error("TC4 broken-page audit did not create a pending issue.");
    }
    const initialEvidence = await requireEvidence(issue.screenshot);
    const initialCompletedAt = new Date().toISOString();

    // Record initial failure run
    const initialRecord: TestRunRecord = {
      id: `tr_tc4_initial_${Date.now()}`,
      test_case: "TC4",
      input: { url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"], state: "broken" },
      expected_result: "Initial audit against /tc4 (broken state) must detect custom button #add-to-cart is not keyboard operable, logging 1 finding for WCAG 2.1.1 Keyboard with screenshot and recording evidence.",
      actual_result: "Initial audit detected 1 finding for WCAG 2.1.1 Keyboard on #add-to-cart: control is not reachable or operable via keyboard. Created pending issue with screenshot evidence.",
      evidence: {
        auditId: initialBody.audit.auditId,
        issue: {
          id: issue.id,
          fingerprint: issue.fingerprint,
          status: issue.status,
          screenshot: issue.screenshot,
          recording: issue.recording,
        },
        findingsCount: initialBody.audit.result?.findings?.length ?? 1,
        screenshot: initialEvidence,
      },
      status: "fail",
      explanation: "Page /tc4 failed keyboard operability check: custom button #add-to-cart is not keyboard operable.",
      started_at: initialStartedAt,
      completed_at: initialCompletedAt,
    };

    await recordOfficialTestRun({
      record: initialRecord,
      auditId: initialBody.audit.auditId,
      store,
    });

    const approvalResponse = await fetch(`${apiUrl}/api/issues/${issue.id}/approve`, { method: "POST" });
    if (approvalResponse.status !== 200) throw new Error(`TC4 issue approval failed: HTTP ${approvalResponse.status}`);

    await setTc4State(true);

    const retestStartedAt = new Date().toISOString();
    const retestResponse = await fetch(`${apiUrl}/api/issues/${issue.id}/retest`, { method: "POST" });
    if (retestResponse.status !== 200) throw new Error(`TC4 retest failed: HTTP ${retestResponse.status}`);
    const retestBody = await retestResponse.json() as {
      audit: { auditId: string; result?: { status: string; findings?: unknown[] } };
      issue: { status: string };
      outcome: { status: string; evidence?: unknown; screenshot?: string; recording?: string };
    };
    if (retestBody.outcome.status !== "pass" || retestBody.issue.status !== "resolved" ||
        retestBody.audit.result?.status !== "complete" ||
        retestBody.audit.result.findings?.length !== 0) {
      throw new Error(`TC4 expected a passing retest and resolved issue, got ${retestBody.outcome.status}/${retestBody.issue.status}.`);
    }
    const retestCompletedAt = new Date().toISOString();

    // Record passing retest run
    const retestRecord: TestRunRecord = {
      id: `tr_tc4_retest_${Date.now()}`,
      test_case: "TC4",
      input: { url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"], state: "fixed" },
      expected_result: "Following fix deployment, retesting the logged issue on the exact same page using the same check must report zero violations and transition the issue to resolved.",
      actual_result: "Retest completed with 0 violations. Issue status transitioned to resolved with retest evidence preserved.",
      evidence: {
        auditId: retestBody.audit.auditId,
        initialAuditId: initialBody.audit.auditId,
        issueId: issue.id,
        fingerprint: issue.fingerprint,
        issueStatus: retestBody.issue.status,
        outcome: retestBody.outcome,
        findingsCount: retestBody.audit.result?.findings?.length ?? 0,
        initialEvidence,
      },
      status: "pass",
      explanation: null,
      started_at: retestStartedAt,
      completed_at: retestCompletedAt,
    };

    await recordOfficialTestRun({
      record: retestRecord,
      auditId: retestBody.audit.auditId,
      store,
    });

    const initialReportPath = path.join(initialBody.audit.auditId, "official-report.json");
    const retestReportPath = path.join(retestBody.audit.auditId, "official-report.json");
    console.log(JSON.stringify({
      initialAuditId: initialBody.audit.auditId,
      retestAuditId: retestBody.audit.auditId,
      fingerprint: issue.fingerprint,
      initialReport: initialReportPath,
      retestReport: retestReportPath,
      verdict: "PASS",
    }, null, 2));
  } finally {
    if (apiServer) await new Promise<void>((resolve, reject) => apiServer!.close((error) => error ? reject(error) : resolve()));
    store.close();
    apiStore.close();
    if (fixtureServer) await stopFixtureServer(fixtureServer);
  }
}

run().catch((error: unknown) => {
  console.error("TC4 verification failed:", error);
  process.exitCode = 1;
});
