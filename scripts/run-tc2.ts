import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { runAudit, type AuditFinding, type KeyboardOperabilityEvidence } from "../engine";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";
import { writeTestRun } from "./lib/testRun";

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

async function resolveServerPort(): Promise<number> {
  if (process.env.FIXTURE_PORT) {
    const envPort = Number(process.env.FIXTURE_PORT);
    if (!(await isPortAvailable(envPort))) {
      throw new Error(`Port ${envPort} specified by FIXTURE_PORT is currently busy.`);
    }
    return envPort;
  }
  if (await isPortAvailable(4000)) {
    return 4000;
  }
  for (let candidate = 4111; candidate <= 4200; candidate++) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  throw new Error("Port 4000 is busy and no free port found in range 4111–4200.");
}

async function resetServerState(baseUrl: string): Promise<void> {
  resetFixtureState();
  try {
    const res = await fetch(`${baseUrl}/__state/reset`, { method: "POST" });
    if (!res.ok) {
      console.warn(`[run-tc2] Warning: POST /__state/reset returned status ${res.status}`);
    }
  } catch (err) {
    console.warn("[run-tc2] Warning: Failed to call /__state/reset HTTP endpoint, relying on in-memory reset:", err);
  }
}

async function main(): Promise<void> {
  let server: http.Server | null = null;
  const startedAt = new Date().toISOString();
  const timestamp = Date.now();
  const auditId = `tc2-${timestamp}`;

  try {
    // Step 1: Start fixture server and POST /__state/reset so /tc2 is broken
    const port = await resolveServerPort();
    server = startFixtureServer(port);
    const baseUrl = `http://localhost:${port}`;
    console.log(`[run-tc2] Fixture server running on ${baseUrl}`);
    await resetServerState(baseUrl);

    // Step 2: Call runAudit via public entrypoint
    console.log(`[run-tc2] Running audit against ${baseUrl}/tc2 (auditId: ${auditId})...`);
    const result = await runAudit({
      url: `${baseUrl}/tc2`,
      wcagLevel: "AA",
      auditId,
      checks: ["axe", "keyboard-operability"],
    });

    // Step 3: Evaluate PASS / FAIL conditions
    let status: "pass" | "fail" | "incomplete" = "pass";
    const failures: string[] = [];

    const axeExec = result.checksExecuted.find((c) => c.checkId === "axe");
    const operabilityExec = result.checksExecuted.find((c) => c.checkId === "keyboard-operability");

    if (result.status !== "complete") {
      status = "incomplete";
      failures.push(`Audit status was not complete: "${result.status}"`);
    } else if (axeExec?.status !== "executed" || operabilityExec?.status !== "executed") {
      status = "incomplete";
      failures.push(
        `Checks were not executed (axe: "${axeExec?.status}", keyboard-operability: "${operabilityExec?.status}")`
      );
    } else {
      // 1. Axe violations check: must be exactly zero. Nonzero axe violations mean fixture is invalid.
      const violationCount = result.axeSummary?.violationCount ?? -1;
      if (violationCount !== 0) {
        failures.push(`TC2 fixture is invalid: axe-core reported ${violationCount} violations (expected 0)`);
      }

      // 2. Keyboard findings check: exactly one finding on #add-to-cart
      if (result.findings.length !== 1) {
        failures.push(`Expected exactly 1 finding, received ${result.findings.length}`);
      }

      const finding = result.findings[0] as AuditFinding | undefined;
      const ev = finding?.evidence as KeyboardOperabilityEvidence | undefined;

      if (finding) {
        if (finding.selector !== "#add-to-cart") {
          failures.push(`Expected finding selector "#add-to-cart", got "${finding.selector}"`);
        }
        if (finding.wcagRule !== "2.1.1 Keyboard") {
          failures.push(`Expected wcagRule "2.1.1 Keyboard", got "${finding.wcagRule}"`);
        }

        // Evidence checks: reachableByTab=false, Enter/Space failure, successful mouse activation
        if (ev?.reachableByTab !== false) {
          failures.push(`Expected evidence.reachableByTab to be false, got ${ev?.reachableByTab}`);
        }
        if (ev?.enterActivated !== false) {
          failures.push(`Expected evidence.enterActivated to be false, got ${ev?.enterActivated}`);
        }
        if (ev?.spaceActivated !== false) {
          failures.push(`Expected evidence.spaceActivated to be false, got ${ev?.spaceActivated}`);
        }
        if (ev?.hasClickHandler !== true) {
          failures.push(`Expected evidence.hasClickHandler to be true (successful mouse activation), got ${ev?.hasClickHandler}`);
        }

        // Screenshot and recording existence & non-empty
        if (!finding.screenshot) {
          failures.push("Finding is missing screenshot relative path");
        } else {
          const screenAbs = path.resolve("evidence", finding.screenshot);
          try {
            const stat = await fs.stat(screenAbs);
            if (stat.size === 0) {
              failures.push(`Screenshot file ${finding.screenshot} is empty (0 bytes)`);
            }
          } catch {
            failures.push(`Screenshot file does not exist at ${screenAbs}`);
          }
        }

        if (!finding.recording) {
          failures.push("Finding is missing recording relative path");
        } else {
          const recAbs = path.resolve("evidence", finding.recording);
          try {
            const stat = await fs.stat(recAbs);
            if (stat.size === 0) {
              failures.push(`Recording file ${finding.recording} is empty (0 bytes)`);
            }
          } catch {
            failures.push(`Recording file does not exist at ${recAbs}`);
          }
        }
      }

      if (failures.length > 0) {
        status = "fail";
      }
    }

    const explanation = failures.length > 0 ? failures.join("; ") : null;

    // Step 4: Write TestRunRecord via scripts/lib/testRun.ts
    const expectedDesc =
      "axe-core automated scanning against /tc2 must report zero violations, while manual keyboard interaction testing identifies custom control #add-to-cart as inoperable via keyboard (unreachable by Tab, Enter/Space inactive, despite mouse click handler present).";

    const finding = result.findings[0] as AuditFinding | undefined;
    const ev = finding?.evidence as KeyboardOperabilityEvidence | undefined;

    const actualDesc =
      status === "pass"
        ? `axe-core executed with 0 violations (${result.axeSummary?.passesCount ?? 15} rules passed). Keyboard interaction check identified 1 failure: control #add-to-cart responds to mouse clicks (hasClickHandler=true) but is unreachable by keyboard navigation (reachableByTab=false, tabsPressed=${ev?.tabsPressed ?? 6}) and cannot be activated via Enter or Space (enterActivated=false, spaceActivated=false). Captured screenshot and .webm interaction recording under /evidence/${auditId}/.`
        : `TC2 execution failed: ${explanation}. axe-core violations: ${result.axeSummary?.violationCount ?? "N/A"}, keyboard findings count: ${result.findings.length}.`;

    const completedAt = new Date().toISOString();

    const recordFile = await writeTestRun({
      id: `tr_tc2_${timestamp}`,
      test_case: "TC2",
      auditId,
      input: {
        url: `${baseUrl}/tc2`,
        wcagLevel: "AA",
        checks: ["axe", "keyboard-operability"],
      },
      expected: expectedDesc,
      actual: actualDesc,
      evidence: {
        auditId,
        axeSummary: result.axeSummary,
        finding: finding
          ? {
              title: finding.title,
              wcagRule: finding.wcagRule,
              severity: finding.severity,
              selector: finding.selector,
              screenshot: finding.screenshot,
              recording: finding.recording,
              evidence: finding.evidence,
            }
          : null,
      },
      status,
      explanation,
      started_at: startedAt,
      completed_at: completedAt,
    });

    // Write explicit axe-summary.json in audit evidence directory
    if (result.axeSummary) {
      await fs.writeFile(
        path.join(process.cwd(), "evidence", auditId, "axe-summary.json"),
        JSON.stringify(result.axeSummary, null, 2),
        "utf-8"
      );
    }

    // Step 5: Print required output lines clearly
    console.log("\n==================================================");
    console.log(`TC2 RESULT: ${status.toUpperCase()}`);
    console.log("==================================================");
    console.log(`axe-core: ${result.axeSummary?.violationCount ?? "unknown"} violations`);
    console.log(
      `keyboard check: ${result.findings.length} failure (${finding?.selector ?? "#add-to-cart"} cannot be reached or activated by keyboard)`
    );
    console.log("--------------------------------------------------");
    console.log(`- Test Case:   TC2 (Automated Tool Passes but Manual Check Fails)`);
    console.log(`- Status:      ${status.toUpperCase()}`);
    console.log(`- Audit ID:    ${auditId}`);
    console.log(`- Record File: ${recordFile}`);
    if (finding?.screenshot) console.log(`- Screenshot:  evidence/${finding.screenshot}`);
    if (finding?.recording)  console.log(`- Recording:   evidence/${finding.recording}`);
    if (explanation)         console.log(`- Failure:     ${explanation}`);
    console.log("==================================================\n");

    // Step 6: Exit 0 only on PASS
    if (status !== "pass") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("[run-tc2] Fatal error:", error);
    process.exitCode = 1;
  } finally {
    // Always stop fixture server
    if (server) {
      await stopFixtureServer(server);
    }
  }
}

main();
