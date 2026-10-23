import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { launchBrowser, navigate, newAuditContext } from "../engine/browser";
import { highlightElement, saveScreenshot, recordOfficialTestRun } from "../engine/evidence";
import { runAudit } from "../engine";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";
import { AuditStore } from "../src/persistence/sqlite";
import type { AuditFinding, TestRunRecord } from "../engine";

const PORT = Number(process.env.FIXTURE_PORT) || 4000;
const BASE_URL = `http://localhost:${PORT}`;
const AUDIT_ID = `official-tc3-${Date.now()}`;

async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function requireEvidence(relativePath: string | undefined): Promise<string> {
  if (!relativePath) throw new Error("TC3 finding is missing required screenshot evidence.");
  const absolutePath = path.join(path.resolve("evidence"), relativePath);
  await fs.access(absolutePath);
  return relativePath;
}

async function run(): Promise<void> {
  let server: http.Server | null = null;
  const store = await AuditStore.open();
  const startedAt = new Date().toISOString();

  try {
    if (!(await isServerRunning())) {
      server = startFixtureServer(PORT);
      for (let attempt = 0; attempt < 20 && !(await isServerRunning()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const result = await runAudit({
      auditId: AUDIT_ID,
      url: `${BASE_URL}/tc3`,
      wcagLevel: "AA",
      checks: ["contrast"],
    });
    const finding = result.findings[0] as AuditFinding | undefined;
    const evidence = finding?.evidence as {
      measuredRatio?: number;
      requiredRatio?: number;
      samples?: unknown[];
    } | undefined;
    if (result.status !== "complete" || result.findings.length !== 1 || finding?.checkId !== "contrast") {
      throw new Error(`TC3 expected one complete contrast finding, got ${result.status} with ${result.findings.length} findings.`);
    }
    if (evidence?.measuredRatio === undefined || evidence.measuredRatio < 1.68 || evidence.measuredRatio > 1.70) {
      throw new Error(`TC3 expected a measured contrast ratio near 1.69:1, got ${evidence?.measuredRatio ?? "missing"}.`);
    }
    if (evidence.requiredRatio !== 4.5 || !evidence.samples?.length) {
      throw new Error("TC3 contrast evidence is missing the 4.5:1 threshold or sampled coordinates.");
    }
    const screenshot = await requireEvidence(finding.screenshot);

    const browser = await launchBrowser();
    const context = await newAuditContext(browser);
    const page = await context.newPage();
    try {
      await navigate(page, `${BASE_URL}/tc3`, { checkId: "contrast" });
      const cleanup = await highlightElement(page, "#hero-caption");
      const annotatedScreenshot = await saveScreenshot(page, AUDIT_ID, "contrast-annotated");
      await cleanup();
      await context.close();
      await browser.close();
      await requireEvidence(annotatedScreenshot);

      const completedAt = new Date().toISOString();

      const record: TestRunRecord = {
        id: `tr_tc3_${Date.now()}`,
        test_case: "TC3",
        input: { url: `${BASE_URL}/tc3`, wcagLevel: "AA", checks: ["contrast"] },
        expected_result: "Grey text (#hero-caption) displayed over a photo background must be evaluated by sampling screenshot pixels. The measured contrast ratio must fall below the WCAG AA 4.5:1 threshold (~1.69:1) and log 1 contrast finding with pixel coordinates and screenshot evidence.",
        actual_result: `Measured contrast ratio ${evidence.measuredRatio}:1 against 4.5:1 threshold on #hero-caption using screenshot background pixel sampling. Produced 1 finding for WCAG 1.4.3 Contrast (Minimum) with screenshot and annotated screenshot evidence.`,
        evidence: {
          auditId: AUDIT_ID,
          finding: {
            title: finding.title,
            wcagRule: finding.wcagRule,
            severity: finding.severity,
            selector: finding.selector,
            screenshot,
            annotatedScreenshot,
            evidence: finding.evidence,
          },
          screenshot,
          annotatedScreenshot,
          sampledCoordinates: evidence.samples,
          measuredRatio: evidence.measuredRatio,
          requiredRatio: evidence.requiredRatio,
        },
        status: "pass",
        explanation: null,
        started_at: startedAt,
        completed_at: completedAt,
      };

      await recordOfficialTestRun({
        record,
        auditId: AUDIT_ID,
        store,
      });

      const reportPath = path.join(AUDIT_ID, "official-report.json");
      console.log(JSON.stringify({ auditId: AUDIT_ID, report: reportPath, verdict: "PASS" }, null, 2));
    } finally {
      if (!page.isClosed()) await page.close();
      if (!context.browser()?.isConnected()) return;
      await browser.close();
    }
  } finally {
    store.close();
    if (server) await stopFixtureServer(server);
  }
}

run().catch((error: unknown) => {
  console.error("TC3 verification failed:", error);
  process.exitCode = 1;
});
