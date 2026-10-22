import fs from "node:fs/promises";
import http from "node:http";
import { createAuditApp } from "../src/api/server";
import { AuditStore } from "../src/persistence/sqlite";
import { runAudit } from "../engine";
import { writeEvidenceJson } from "../engine/evidence";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

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
  const store = await AuditStore.open(":memory:");
  try {
    if (!(await isServerRunning())) {
      fixtureServer = startFixtureServer(PORT);
      for (let attempt = 0; attempt < 20 && !(await isServerRunning()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    await setTc4State(false);

    apiServer = http.createServer(createAuditApp({ store, runAudit }));
    const apiPort = await listen(apiServer);
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const headers = { "Content-Type": "application/json" };
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

    const approvalResponse = await fetch(`${apiUrl}/api/issues/${issue.id}/approve`, { method: "POST" });
    if (approvalResponse.status !== 200) throw new Error(`TC4 issue approval failed: HTTP ${approvalResponse.status}`);

    await setTc4State(true);
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

    const initialReport = {
      input: { url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"], state: "broken" },
      expected: { findingCount: 1, retestStatus: "pass", issueStatus: "resolved" },
      actual: initialBody.audit.result,
      issue: { id: issue.id, fingerprint: issue.fingerprint, status: issue.status },
      evidence: { initial: initialEvidence },
      verdict: "PASS",
    };
    const retestReport = {
      input: { url: AUDIT_URL, wcagLevel: "AA", checks: ["keyboard-operability"], state: "fixed" },
      expected: { findingCount: 0, retestStatus: "pass", issueStatus: "resolved" },
      actual: retestBody.audit.result,
      issue: retestBody.issue,
      retestLog: retestBody.outcome,
      evidence: { initial: initialEvidence, retest: retestBody.outcome },
      verdict: "PASS",
    };
    const initialReportPath = await writeEvidenceJson(initialBody.audit.auditId, "official-report", initialReport);
    const retestReportPath = await writeEvidenceJson(retestBody.audit.auditId, "official-report", retestReport);
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
    if (fixtureServer) await stopFixtureServer(fixtureServer);
  }
}

run().catch((error: unknown) => {
  console.error("TC4 verification failed:", error);
  process.exitCode = 1;
});
