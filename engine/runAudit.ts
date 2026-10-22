import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import { closeBrowser, launchBrowser, navigate, newAuditContext, saveScreenshot } from "./browser";
import { sampleContrast } from "./contrast-sampler";
import { runKeyboardTrapCheck } from "./checks/keyboardTrap";
import { runKeyboardOperabilityCheck } from "./checks/keyboardOperability";
import type { AuditFinding, AuditInput, AuditResult, CheckId } from "./types";
import { createStableFindingId } from "../src/audit/finding-id";
import path from "node:path";
import { EVIDENCE_DIR, writeEvidenceJson } from "./browser";

const allChecks: CheckId[] = ["axe", "keyboard-trap", "keyboard-operability", "contrast"];

function axeFinding(input: AuditInput, violation: {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  description: string;
  nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
}): AuditFinding {
  const selector = violation.nodes[0]?.target[0];
  const fingerprint = createStableFindingId({
    pageUrl: input.url,
    source: "axe",
    ruleId: violation.id,
    wcagCriteria: [],
    selector: selector ?? violation.id,
  }).replace(/^fnd_/, "");
  return {
    title: violation.help,
    description: violation.description,
    wcagRule: violation.id,
    severity: violation.impact === "critical" ? "critical" : violation.impact === "serious" ? "serious" : violation.impact === "moderate" ? "moderate" : "minor",
    source: "axe",
    checkId: "axe",
    fingerprint,
    selector,
    evidence: {
      ruleId: violation.id,
      impact: violation.impact ?? null,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes,
    },
  };
}

async function runAxe(page: Page, input: AuditInput): Promise<{
  findings: AuditFinding[];
  summary: AuditResult["axeSummary"];
}> {
  const result = await new AxeBuilder({ page }).withTags(
    input.wcagLevel === "A" ? ["wcag2a", "wcag21a"] : input.wcagLevel === "AA" ? ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] : ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  ).analyze();
  return {
    findings: result.violations.map((violation) => axeFinding(input, {
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      helpUrl: violation.helpUrl,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        target: Array.isArray(node.target) ? node.target.map(String) : [String(node.target)],
        failureSummary: node.failureSummary,
      })),
    })),
    summary: {
      violationCount: result.violations.length,
      passesCount: result.passes.length,
      incompleteCount: result.incomplete.length,
    },
  };
}

async function runContrast(page: Page, input: AuditInput): Promise<AuditFinding | undefined> {
  const target = page.locator("#hero-caption");
  if (await target.count() === 0) return undefined;
  const boundingBox = await target.boundingBox();
  const text = await target.textContent();
  if (!boundingBox || text === null) throw new Error("Contrast target #hero-caption has no rendered bounds or text.");
  const screenshot = await saveScreenshot(page, input.auditId, "contrast");
  const result = await sampleContrast({
    checkId: "tc3-contrast",
    pageUrl: input.url,
    screenshot: { kind: "path", path: path.join(EVIDENCE_DIR, screenshot), mimeType: "image/png" },
    target: { selector: "#hero-caption", text, boundingBox },
    wcagCriterion: "1.4.3",
    requiredRatio: 4.5,
  });
  await writeEvidenceJson(input.auditId, "contrast", result.evidence);
  if (result.status !== "fail") return undefined;
  const fingerprint = createStableFindingId({
    pageUrl: input.url,
    source: "contrast",
    ruleId: "1.4.3",
    wcagCriteria: ["1.4.3"],
    selector: "#hero-caption",
  }).replace(/^fnd_/, "");
  return {
    title: "Insufficient text contrast",
    description: result.summary,
    wcagRule: "1.4.3 Contrast (Minimum)",
    severity: "serious",
    source: "contrast",
    checkId: "contrast",
    fingerprint,
    selector: "#hero-caption",
    screenshot,
    evidence: result.evidence,
  };
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const startedAt = new Date().toISOString();
  const planned = input.checks ?? allChecks;
  const checksExecuted: AuditResult["checksExecuted"] = [];
  const findings: AuditFinding[] = [];
  let axeSummary: AuditResult["axeSummary"];
  let status: AuditResult["status"] = "complete";
  const browser = await launchBrowser();
  const context = await newAuditContext(browser);
  const page = await context.newPage();

  try {
    try {
      await navigate(page, input.url, { checkId: planned[0] ?? "axe" });
    } catch (navError) {
      status = "error";
      const errorMsg = navError instanceof Error ? navError.message : String(navError);
      for (const checkId of planned) {
        checksExecuted.push({ checkId, status: "failed", error: errorMsg });
      }
      return {
        auditId: input.auditId,
        url: input.url,
        status,
        findings,
        checksPlanned: planned,
        checksExecuted,
        axeSummary,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    for (const checkId of planned) {
      if (checkId === "axe") {
        try {
          const axe = await runAxe(page, input);
          findings.push(...axe.findings);
          axeSummary = axe.summary;
          checksExecuted.push({ checkId, status: "executed" });
        } catch (error) {
          checksExecuted.push({
            checkId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
          status = "incomplete";
        }
      } else if (checkId === "contrast") {
        try {
          const finding = await runContrast(page, input);
          if (finding) findings.push(finding);
          checksExecuted.push({ checkId, status: "executed" });
        } catch (error) {
          checksExecuted.push({
            checkId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
          status = "incomplete";
        }
      } else if (checkId === "keyboard-trap") {
        try {
          const trapFindings = await runKeyboardTrapCheck({
            url: input.url,
            auditId: input.auditId,
            browser,
          });
          findings.push(...trapFindings);
          checksExecuted.push({ checkId, status: "executed" });
        } catch (error) {
          checksExecuted.push({
            checkId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
          status = "incomplete";
        }
      } else if (checkId === "keyboard-operability") {
        try {
          const operabilityFindings = await runKeyboardOperabilityCheck({
            url: input.url,
            auditId: input.auditId,
            browser,
          });
          findings.push(...operabilityFindings);
          checksExecuted.push({ checkId, status: "executed" });
        } catch (error) {
          checksExecuted.push({
            checkId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
          status = "incomplete";
        }
      } else {
        checksExecuted.push({
          checkId,
          status: "skipped",
          error: `Unsupported check ID: ${checkId}`,
        });
        status = "incomplete";
      }
    }
  } finally {
    await context.close();
    await closeBrowser(browser);
  }

  return {
    auditId: input.auditId,
    url: input.url,
    status,
    findings,
    checksPlanned: planned,
    checksExecuted,
    axeSummary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
