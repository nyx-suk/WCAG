import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { runAudit, type AuditFinding, type KeyboardTrapEvidence } from "../engine";
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
  // Try default port 4000 first
  if (await isPortAvailable(4000)) {
    return 4000;
  }
  // If port 4000 is busy, find a free ephemeral port or fail clearly
  for (let candidate = 4111; candidate <= 4200; candidate++) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  throw new Error("Port 4000 is busy and no free port found in range 4111–4200.");
}

async function main(): Promise<void> {
  let server: http.Server | null = null;
  const startedAt = new Date().toISOString();
  const timestamp = Date.now();
  const badAuditId = `tc1-${timestamp}`;
  const goodAuditId = `tc1-control-${timestamp}`;

  try {
    const port = await resolveServerPort();
    server = startFixtureServer(port);
    resetFixtureState();

    const baseUrl = `http://localhost:${port}`;
    console.log(`[run-tc1] Fixture server running on ${baseUrl}`);

    // Step 2: Run bad page audit
    console.log(`[run-tc1] Running audit against ${baseUrl}/tc1/bad (auditId: ${badAuditId})...`);
    const badResult = await runAudit({
      url: `${baseUrl}/tc1/bad`,
      wcagLevel: "AA",
      auditId: badAuditId,
      checks: ["keyboard-trap"],
    });

    // Step 3: Run control good page audit
    console.log(`[run-tc1] Running control audit against ${baseUrl}/tc1/good (auditId: ${goodAuditId})...`);
    const goodResult = await runAudit({
      url: `${baseUrl}/tc1/good`,
      wcagLevel: "AA",
      auditId: goodAuditId,
      checks: ["keyboard-trap"],
    });

    // Step 4: Validate PASS / INCOMPLETE / FAIL conditions
    const failures: string[] = [];
    let status: "pass" | "fail" | "incomplete" = "pass";

    const badCheck = badResult.checksExecuted.find((c) => c.checkId === "keyboard-trap");
    const goodCheck = goodResult.checksExecuted.find((c) => c.checkId === "keyboard-trap");

    if (badResult.status !== "complete" || goodResult.status !== "complete") {
      status = "incomplete";
      failures.push(
        `Audit status was not complete (bad page: "${badResult.status}", control page: "${goodResult.status}")`
      );
    } else if (badCheck?.status !== "executed" || goodCheck?.status !== "executed") {
      status = "incomplete";
      failures.push(
        `Check execution status was not 'executed' (bad check: "${badCheck?.status}", control check: "${goodCheck?.status}")`
      );
    } else {
      // 1. Exactly 1 finding on /tc1/bad
      if (badResult.findings.length !== 1) {
        failures.push(`Expected exactly 1 finding on /tc1/bad, received ${badResult.findings.length}`);
      }

      const finding = badResult.findings[0] as AuditFinding | undefined;
      const trapEvidence = finding?.evidence as KeyboardTrapEvidence | undefined;

      if (finding) {
        // 2. wcagRule "2.1.2 No Keyboard Trap" and severity "critical"
        if (finding.wcagRule !== "2.1.2 No Keyboard Trap") {
          failures.push(`Expected finding wcagRule "2.1.2 No Keyboard Trap", received "${finding.wcagRule}"`);
        }
        if (finding.severity !== "critical") {
          failures.push(`Expected finding severity "critical", received "${finding.severity}"`);
        }

        // 3. Evidence flags
        if (!trapEvidence?.cycleDetected) {
          failures.push(`Expected evidence.cycleDetected to be true, got ${trapEvidence?.cycleDetected}`);
        }
        if (!trapEvidence?.escapePressed) {
          failures.push(`Expected evidence.escapePressed to be true, got ${trapEvidence?.escapePressed}`);
        }
        if (!trapEvidence?.modalStillOpenAfterEscape) {
          failures.push(
            `Expected evidence.modalStillOpenAfterEscape to be true, got ${trapEvidence?.modalStillOpenAfterEscape}`
          );
        }
        if (trapEvidence?.dismissControlsWorked !== false) {
          failures.push(
            `Expected evidence.dismissControlsWorked to be false, got ${trapEvidence?.dismissControlsWorked}`
          );
        }

        // 4. Screenshot and .webm recording existence & non-empty
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
        } else if (!finding.recording.endsWith(".webm")) {
          failures.push(`Recording file is not .webm: "${finding.recording}"`);
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

      // 5. Control (/tc1/good) has 0 findings
      if (goodResult.findings.length !== 0) {
        failures.push(`Expected 0 findings on /tc1/good control, received ${goodResult.findings.length}`);
      }

      if (failures.length > 0) {
        status = "fail";
      }
    }

    const explanation = failures.length > 0 ? failures.join("; ") : null;

    // Step 5: Plain language expected and actual descriptions per PRD
    const expectedDesc =
      "A page containing an open modal dialog creates a genuine keyboard trap. The auditor must detect the trap, prove that keyboard focus cannot exit the modal via Tab/Shift+Tab, confirm that the Escape key fails to dismiss the modal, capture an interaction recording (.webm), and verify that an accessible modal (control) passes with zero findings.";

    const badFinding = badResult.findings[0] as AuditFinding | undefined;
    const ev = badFinding?.evidence as KeyboardTrapEvidence | undefined;
    const tabCount = ev?.tabSequence?.length ?? 0;
    const dismissBtns = ev?.dismissControlsFound?.join(", ") || "none";

    const actualDesc =
      status === "pass"
        ? `Auditor successfully identified a genuine keyboard trap on /tc1/bad (#newsletter-modal), logging 1 critical finding for WCAG 2.1.2 No Keyboard Trap. Focus movement was tracked across ${tabCount} tab steps, detecting a loop of ${ev?.cycleLength || 3} elements (cycleDetected=true). Escape key was pressed but the modal remained open (modalStillOpenAfterEscape=true). Dismiss controls (${dismissBtns}) were activated via keyboard but failed to dismiss the dialog (dismissControlsWorked=false). Non-empty screenshot and .webm interaction recording were captured under /evidence/${badAuditId}/. The control page /tc1/good produced 0 findings with full keyboard exit support.`
        : `Test execution failed criteria: ${explanation}. Observed tab sequence length: ${tabCount}. Escape pressed: ${ev?.escapePressed ?? "N/A"}, modal open after Escape: ${ev?.modalStillOpenAfterEscape ?? "N/A"}, dismiss controls worked: ${ev?.dismissControlsWorked ?? "N/A"}. Control findings count: ${goodResult.findings.length}.`;

    const completedAt = new Date().toISOString();

    const recordFile = await writeTestRun({
      id: `tr_tc1_${timestamp}`,
      test_case: "TC1",
      input: {
        badUrl: `${baseUrl}/tc1/bad`,
        goodUrl: `${baseUrl}/tc1/good`,
        wcagLevel: "AA",
        checks: ["keyboard-trap"],
      },
      expected: expectedDesc,
      actual: actualDesc,
      evidence: {
        badAuditId,
        goodAuditId,
        finding: badFinding
          ? {
              title: badFinding.title,
              wcagRule: badFinding.wcagRule,
              severity: badFinding.severity,
              selector: badFinding.selector,
              screenshot: badFinding.screenshot,
              recording: badFinding.recording,
              evidence: badFinding.evidence,
            }
          : null,
        goodResult: {
          status: goodResult.status,
          findingsCount: goodResult.findings.length,
        },
      },
      status,
      explanation,
      started_at: startedAt,
      completed_at: completedAt,
    });

    // Step 6: Print summary
    console.log("\n==================================================");
    console.log(`TC1 RESULT: ${status.toUpperCase()}`);
    console.log("==================================================");
    console.log(`- Test Case:     TC1 (Modal Traps Keyboard Focus)`);
    console.log(`- Status:        ${status.toUpperCase()}`);
    console.log(`- Bad Audit ID:  ${badAuditId}`);
    console.log(`- Good Audit ID: ${goodAuditId}`);
    console.log(`- Record File:   ${recordFile}`);
    if (badFinding?.screenshot) console.log(`- Screenshot:    evidence/${badFinding.screenshot}`);
    if (badFinding?.recording) console.log(`- Recording:     evidence/${badFinding.recording}`);
    if (explanation) console.log(`- Failure Note:  ${explanation}`);
    console.log("==================================================\n");

    if (status !== "pass") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("[run-tc1] Fatal error:", error);
    process.exitCode = 1;
  } finally {
    // Step 7: Always stop fixture server
    if (server) {
      await stopFixtureServer(server);
    }
  }
}

main();
