import http from "node:http";
import net from "node:net";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import { createAuditApp } from "../src/api/server";
import { AuditStore } from "../src/persistence/sqlite";
import { runAudit } from "../engine";

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port);
  });
}

async function resolveFixturePort(): Promise<number> {
  if (process.env.FIXTURE_PORT) {
    const envPort = Number(process.env.FIXTURE_PORT);
    if (!(await isPortAvailable(envPort))) {
      throw new Error(`Port ${envPort} specified by FIXTURE_PORT is currently busy.`);
    }
    return envPort;
  }
  if (await isPortAvailable(4000)) return 4000;
  for (let candidate = 4111; candidate <= 4200; candidate++) {
    if (await isPortAvailable(candidate)) return candidate;
  }
  throw new Error("Port 4000 is busy and no free port found in range 4111–4200.");
}

async function listenEphemeral(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to obtain API server address.");
  return address.port;
}

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  details: string;
}

async function main(): Promise<void> {
  let fixtureServer: http.Server | null = null;
  let apiServer: http.Server | null = null;
  let store: AuditStore | null = null;

  const results: StepResult[] = [];
  const discrepancies: string[] = [];

  try {
    const fixturePort = await resolveFixturePort();
    fixtureServer = startFixtureServer(fixturePort);
    const fixtureUrl = `http://localhost:${fixturePort}`;
    resetFixtureState();

    store = await AuditStore.open(":memory:");
    apiServer = http.createServer(createAuditApp({ store, runAudit }));
    const apiPort = await listenEphemeral(apiServer);
    const apiUrl = `http://127.0.0.1:${apiPort}`;

    console.log(`[verify-e2e] Fixture server running on ${fixtureUrl}`);
    console.log(`[verify-e2e] API server running on ${apiUrl}\n`);

    // =========================================================================
    // Step 1: POST audit for /tc2 (broken) with all default checks
    // =========================================================================
    try {
      const res = await fetch(`${apiUrl}/api/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `${fixtureUrl}/tc2`, wcagLevel: "AA" }),
      });

      if (res.status !== 201) {
        throw new Error(`Expected HTTP 201, received HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        audit: { auditId: string; status: string; checksPlanned: string[] };
        issues: Array<{
          id: string;
          source: string;
          selector?: string;
          status: string;
          screenshot?: string;
          recording?: string;
        }>;
      };

      if (!body.issues || body.issues.length !== 1) {
        throw new Error(`Expected exactly 1 issue persisted, got ${body.issues?.length}`);
      }

      const issue = body.issues[0];
      if (issue.source !== "keyboard-operability") {
        throw new Error(`Expected source "keyboard-operability", got "${issue.source}"`);
      }
      if (issue.selector !== "#add-to-cart") {
        throw new Error(`Expected selector "#add-to-cart", got "${issue.selector}"`);
      }
      if (!issue.screenshot || !issue.recording) {
        throw new Error("Issue is missing screenshot or recording evidence relative path");
      }
      if (issue.status !== "pending_approval") {
        throw new Error(`Expected issue status "pending_approval", got "${issue.status}"`);
      }

      results.push({
        step: 1,
        name: "POST audit /tc2 (broken) with default checks",
        passed: true,
        details: `Created audit ${body.audit.auditId}; persisted keyboard-operability issue ${issue.id} with screenshot & recording`,
      });
      console.log(`[PASS] Step 1: POST audit /tc2 (broken) persisted keyboard finding ${issue.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 1, name: "POST audit /tc2 (broken) with default checks", passed: false, details: msg });
      console.error(`[FAIL] Step 1: ${msg}`);
      throw err;
    }

    const issueId = (await (await fetch(`${apiUrl}/api/audits`)).json() as any)[0].issues[0].id;

    // =========================================================================
    // Step 2: Approve that issue via the API
    // =========================================================================
    try {
      const res = await fetch(`${apiUrl}/api/issues/${issueId}/approve`, { method: "POST" });
      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200, received HTTP ${res.status}`);
      }
      const updated = (await res.json()) as { id: string; status: string };
      if (updated.status !== "approved_logged") {
        throw new Error(`Expected status "approved_logged", received "${updated.status}"`);
      }

      results.push({
        step: 2,
        name: "Approve issue via API",
        passed: true,
        details: `Issue ${issueId} transitioned to "approved_logged"`,
      });
      console.log(`[PASS] Step 2: Issue ${issueId} approved and transitioned to approved_logged`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 2, name: "Approve issue via API", passed: false, details: msg });
      console.error(`[FAIL] Step 2: ${msg}`);
      throw err;
    }

    // =========================================================================
    // Step 3: Retest WHILE STILL BROKEN
    // =========================================================================
    try {
      const res = await fetch(`${apiUrl}/api/issues/${issueId}/retest`, { method: "POST" });
      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200, received HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        audit: { auditId: string; status: string };
        issue: { id: string; status: string };
        outcome: { status: string };
      };

      if (body.outcome.status !== "fail") {
        throw new Error(`Expected retest outcome "fail", received "${body.outcome.status}"`);
      }
      if (body.issue.status !== "approved_logged") {
        throw new Error(`Expected issue to remain "approved_logged", received "${body.issue.status}"`);
      }

      results.push({
        step: 3,
        name: "Retest while still broken",
        passed: true,
        details: `Retest produced outcome "fail", issue remained OPEN (status: "${body.issue.status}")`,
      });
      console.log(`[PASS] Step 3: Retest while still broken produced outcome "fail", issue remained approved_logged`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 3, name: "Retest while still broken", passed: false, details: msg });
      console.error(`[FAIL] Step 3: ${msg}`);
      throw err;
    }

    // =========================================================================
    // Step 6: Confirm retest ending in "incomplete" or "error" does NOT resolve
    // =========================================================================
    try {
      // Note: POST /api/issues/:id/retest does not take a URL override in req.body;
      // it preserves original.input.url per PRD FR-08.
      // We simulate an unreachable host / navigation error by temporarily stopping fixture server.
      await stopFixtureServer(fixtureServer);
      fixtureServer = null;

      const res = await fetch(`${apiUrl}/api/issues/${issueId}/retest`, { method: "POST" });
      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200 with recorded retest, got HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        audit: { auditId: string; status: string; result?: { status: string } };
        issue: { id: string; status: string };
        outcome: { status: string };
      };

      if (body.outcome.status !== "incomplete") {
        throw new Error(`Expected retest outcome "incomplete" on navigation error, got "${body.outcome.status}"`);
      }
      if (body.issue.status !== "approved_logged") {
        throw new Error(`Expected issue to remain "approved_logged", got "${body.issue.status}"`);
      }

      // Restart fixture server for remaining steps
      fixtureServer = startFixtureServer(fixturePort);

      results.push({
        step: 6,
        name: "Retest with navigation failure does not resolve",
        passed: true,
        details: `Simulated navigation error produced outcome "incomplete", issue remained "approved_logged"`,
      });
      console.log(`[PASS] Step 6: Navigation error produced outcome "incomplete", issue remained approved_logged`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 6, name: "Retest with navigation failure does not resolve", passed: false, details: msg });
      console.error(`[FAIL] Step 6: ${msg}`);
      // Restart fixture server if stopped
      if (!fixtureServer) fixtureServer = startFixtureServer(fixturePort);
      throw err;
    }

    // =========================================================================
    // Step 4: Fix /tc2 and retest
    // =========================================================================
    try {
      // Toggle TC2 state to fixed
      const toggleRes = await fetch(`${fixtureUrl}/__state/tc2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixed: true }),
      });
      if (!toggleRes.ok) throw new Error(`Failed to toggle TC2 state: HTTP ${toggleRes.status}`);

      const res = await fetch(`${apiUrl}/api/issues/${issueId}/retest`, { method: "POST" });
      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200, received HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        audit: { auditId: string; url: string; input: { checks?: string[] }; result?: { status: string; findings: unknown[] } };
        issue: { id: string; status: string };
        outcome: { status: string };
      };

      if (body.outcome.status !== "pass") {
        throw new Error(`Expected retest outcome "pass", received "${body.outcome.status}"`);
      }
      if (body.issue.status !== "resolved") {
        throw new Error(`Expected issue status "resolved", received "${body.issue.status}"`);
      }
      if (!body.audit.input.checks || body.audit.input.checks.length !== 1 || body.audit.input.checks[0] !== "keyboard-operability") {
        throw new Error(
          `Expected retest to only run ["keyboard-operability"], got [${body.audit.input.checks?.join(", ")}]`
        );
      }

      // Verify retest result is linked to the original issue in SQLite
      const issueDb = store.getIssue(issueId);
      if (!issueDb || issueDb.status !== "resolved") {
        throw new Error(`Database check failed: issue status is "${issueDb?.status}"`);
      }

      results.push({
        step: 4,
        name: "Retest on fixed page resolves issue",
        passed: true,
        details: `Issue ${issueId} resolved; retest ran only ["keyboard-operability"] and is linked to original issue`,
      });
      console.log(`[PASS] Step 4: Retest on fixed page resolved issue and only ran ["keyboard-operability"]`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 4, name: "Retest on fixed page resolves issue", passed: false, details: msg });
      console.error(`[FAIL] Step 4: ${msg}`);
      throw err;
    }

    // =========================================================================
    // Step 5: Reset state (POST /__state/reset)
    // =========================================================================
    try {
      const resetRes = await fetch(`${fixtureUrl}/__state/reset`, { method: "POST" });
      if (!resetRes.ok) throw new Error(`POST /__state/reset failed with HTTP ${resetRes.status}`);

      const stateCheck = (await (await fetch(`${fixtureUrl}/__state/tc2`)).json()) as { fixed: boolean };
      if (stateCheck.fixed !== false) {
        throw new Error("Fixture state was not reset to fixed=false");
      }

      results.push({
        step: 5,
        name: "Reset state via POST /__state/reset",
        passed: true,
        details: "Fixture state verified reset to fixed=false",
      });
      console.log("[PASS] Step 5: Fixture state reset successfully to broken");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 5, name: "Reset state via POST /__state/reset", passed: false, details: msg });
      console.error(`[FAIL] Step 5: ${msg}`);
      throw err;
    }

    // =========================================================================
    // Summary
    // =========================================================================
    console.log("\n==================================================");
    console.log("E2E TC2 RETEST VERIFICATION SUMMARY");
    console.log("==================================================");
    for (const r of results) {
      console.log(`Step ${r.step} [${r.passed ? "PASS" : "FAIL"}]: ${r.name}`);
      console.log(`   -> ${r.details}`);
    }
    console.log("==================================================\n");

    const allPassed = results.every((r) => r.passed);
    if (!allPassed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n[verify-e2e] Verification halted with error:", error);
    process.exitCode = 1;
  } finally {
    if (apiServer) {
      await new Promise<void>((resolve, reject) =>
        apiServer!.close((err) => (err ? reject(err) : resolve()))
      );
    }
    if (store) {
      store.close();
    }
    if (fixtureServer) {
      await stopFixtureServer(fixtureServer);
    }
  }
}

main();
