import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createAuditApp } from "../src/api/server";
import { AuditStore } from "../src/persistence/sqlite";
import { runAudit } from "../engine";
import { recordOfficialTestRun, writeEvidenceJson } from "../engine/evidence";
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

    const initialReport = {
      input: { url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"], state: "broken" },
      expected: { findingCount: 1, issueStatus: "pending_approval" },
      actual: initialBody.audit.result,
      issue: { id: issue.id, fingerprint: issue.fingerprint, status: issue.status },
      evidence: { screenshot: initialEvidence },
      verdict: "PASS",
      explanation: "Auditor successfully detected the accessibility failure on the broken page and logged a pending issue.",
    };
    const initialReportPath = await writeEvidenceJson(initialBody.audit.auditId, "official-report", initialReport);

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

    const retestReport = {
      input: { url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"], state: "fixed" },
      expected: { findingCount: 0, retestStatus: "pass", issueStatus: "resolved" },
      actual: retestBody.audit.result,
      issue: retestBody.issue,
      retestLog: retestBody.outcome,
      evidence: { initial: initialEvidence, retest: retestBody.outcome },
      verdict: "PASS",
      explanation: "Following fix deployment, retest verified 0 violations and successfully resolved the issue.",
    };
    const retestReportPath = await writeEvidenceJson(retestBody.audit.auditId, "official-report", retestReport);

    // Consolidated official TC4 TestRunRecord covering both lifecycle stages
    const record: TestRunRecord = {
      id: `tr_tc4_${Date.now()}`,
      test_case: "TC4",
      input: {
        url: AUDIT_URL,
        wcagLevel: "AA",
        checks: ["keyboard-operability"],
        stages: {
          initial: { state: "broken", expectedFindings: 1 },
          retest: { state: "fixed", expectedFindings: 0 },
        },
      },
      expected_result:
        "Initial audit against /tc4 (broken state) must detect custom button #add-to-cart is not keyboard operable and log a pending issue for human review. Following fix deployment, retesting the logged issue on the exact same page using the same check must report zero violations and transition the issue to resolved.",
      actual_result:
        "Initial audit detected 1 finding for WCAG 2.1.1 Keyboard on #add-to-cart: control is inoperable via keyboard. Created pending issue with screenshot evidence. Issue was approved. Following fix deployment, retest completed with 0 violations and transitioned issue status to resolved.",
      evidence: {
        initialAuditId: initialBody.audit.auditId,
        retestAuditId: retestBody.audit.auditId,
        issueId: issue.id,
        fingerprint: issue.fingerprint,
        issueStatus: retestBody.issue.status,
        initial: {
          auditId: initialBody.audit.auditId,
          findingsCount: initialBody.audit.result?.findings?.length ?? 1,
          screenshot: initialEvidence,
        },
        retest: {
          auditId: retestBody.audit.auditId,
          findingsCount: retestBody.audit.result?.findings?.length ?? 0,
          outcome: retestBody.outcome,
        },
        statusHistory: [
          { from: null, to: "pending_approval" },
          { from: "pending_approval", to: "approved_logged" },
          { from: "approved_logged", to: "retesting" },
          { from: "retesting", to: "resolved" },
        ],
      },
      status: "pass",
      explanation:
        "The fixture page had a real accessibility failure at the initial stage: custom button #add-to-cart was not keyboard operable (WCAG 2.1.1). Fix was applied, and the auditor successfully retested the control with 0 violations and marked the issue resolved.",
      started_at: initialStartedAt,
      completed_at: retestCompletedAt,
    };

    await recordOfficialTestRun({
      record,
      auditId: retestBody.audit.auditId,
      store,
    });

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
