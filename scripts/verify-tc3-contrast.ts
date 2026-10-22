import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { launchBrowser, navigate, newAuditContext } from "../engine/browser";
import { highlightElement, saveScreenshot, writeEvidenceJson } from "../engine/evidence";
import { runAudit } from "../engine";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";
import type { AuditFinding, AuditResult } from "../engine";

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
      const report = {
        input: { url: `${BASE_URL}/tc3`, wcagLevel: "AA", checks: ["contrast"] },
        expected: { status: "complete", findingCount: 1, measuredRatio: "1.69:1", requiredRatio: "4.5:1" },
        actual: result,
        sampledCoordinates: evidence.samples,
        evidence: { screenshot, annotatedScreenshot },
        verdict: "PASS",
      };
      const reportPath = await writeEvidenceJson(AUDIT_ID, "official-report", report);
      console.log(JSON.stringify({ auditId: AUDIT_ID, report: reportPath, verdict: report.verdict }, null, 2));
    } finally {
      if (!page.isClosed()) await page.close();
      if (!context.browser()?.isConnected()) return;
      await browser.close();
    }
  } finally {
    if (server) await stopFixtureServer(server);
  }
}

run().catch((error: unknown) => {
  console.error("TC3 verification failed:", error);
  process.exitCode = 1;
});
