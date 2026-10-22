import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import {
  closeBrowser,
  launchBrowser,
  navigate,
  newAuditContext,
  saveScreenshot,
  withTimeout,
} from "./browser";
import { runKeyboardTrapCheck } from "./checks/keyboardTrap";
import { runKeyboardOperabilityCheck } from "./checks/keyboardOperability";
import type { AuditFinding, AuditInput, AuditResult, CheckId } from "./types";
import { ValidationError } from "./errors";
import { makeFingerprint } from "./fingerprint";
import path from "node:path";
import { EVIDENCE_DIR, writeEvidenceJson } from "./browser";

const allChecks: CheckId[] = ["axe", "keyboard-trap", "keyboard-operability", "contrast"];

export const AXE_TIMEOUT_MS = 30000;
export const CONTRAST_TIMEOUT_MS = 30000;

let checkTimeoutOverrides: Partial<Record<CheckId, number>> = {};

export function setCheckTimeoutOverride(checkId: CheckId, timeoutMs: number): void {
  checkTimeoutOverrides[checkId] = timeoutMs;
}

export function resetCheckTimeoutOverrides(): void {
  checkTimeoutOverrides = {};
}

function getCheckTimeout(checkId: CheckId, defaultMs: number): number {
  return checkTimeoutOverrides[checkId] ?? defaultMs;
}

function axeFinding(input: AuditInput, violation: {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  description: string;
  nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
}): AuditFinding {
  const firstNodeSelector = violation.nodes[0]?.target[0] ?? violation.id;
  const axeSelectorKey = `${violation.id}|${firstNodeSelector}`;
  const fingerprint = makeFingerprint("axe", input.url, axeSelectorKey);
  const selector = violation.nodes[0]?.target[0];
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

export let contrastModulePath = "./contrast-sampler";
let contrastModuleOverride: unknown = null;

export function setContrastModulePath(customPath: string): void {
  contrastModulePath = customPath;
  contrastModuleOverride = null;
}

export function setContrastModuleStub(stub: unknown): void {
  contrastModuleOverride = stub;
}

export function resetContrastModulePath(): void {
  contrastModulePath = "./contrast-sampler";
  contrastModuleOverride = null;
}

async function runContrast(
  page: Page,
  input: AuditInput,
  samplerFn: (options: any) => Promise<any>
): Promise<AuditFinding | undefined> {
  const target = page.locator("#hero-caption");
  if (await target.count() === 0) return undefined;
  const boundingBox = await target.boundingBox();
  const text = await target.textContent();
  if (!boundingBox || text === null) throw new Error("Contrast target #hero-caption has no rendered bounds or text.");
  const screenshot = await saveScreenshot(page, input.auditId, "contrast");
  const result = await samplerFn({
    checkId: "tc3-contrast",
    pageUrl: input.url,
    screenshot: { kind: "path", path: path.join(EVIDENCE_DIR, screenshot), mimeType: "image/png" },
    target: { selector: "#hero-caption", text, boundingBox },
    wcagCriterion: "1.4.3",
    requiredRatio: 4.5,
  });
  await writeEvidenceJson(input.auditId, "contrast", result.evidence);
  if (result.status !== "fail") return undefined;
  const selector = "#hero-caption";
  const fingerprint = makeFingerprint("contrast", input.url, selector);
  return {
    title: "Insufficient text contrast",
    description: result.summary,
    wcagRule: "1.4.3 Contrast (Minimum)",
    severity: "serious",
    source: "contrast",
    checkId: "contrast",
    fingerprint,
    selector,
    screenshot,
    evidence: result.evidence,
  };
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  // 1. Validate auditId: trimmed nonempty string, at most 100 characters, only [A-Za-z0-9._-]
  if (!input.auditId || typeof input.auditId !== "string" || input.auditId.trim().length === 0) {
    throw new ValidationError("Invalid auditId: must be a non-empty string");
  }
  if (input.auditId.trim() !== input.auditId) {
    throw new ValidationError("Invalid auditId: must be trimmed without leading or trailing whitespace");
  }
  if (input.auditId.length > 100) {
    throw new ValidationError("Invalid auditId: must be at most 100 characters");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(input.auditId)) {
    throw new ValidationError(
      "Invalid auditId: must contain only alphanumeric characters, periods, underscores, or hyphens"
    );
  }

  // 2. Validate wcagLevel: exactly "A", "AA", or "AAA"
  if (input.wcagLevel !== "A" && input.wcagLevel !== "AA" && input.wcagLevel !== "AAA") {
    throw new ValidationError(
      `Invalid wcagLevel: expected 'A', 'AA', or 'AAA', received '${String(input.wcagLevel)}'`
    );
  }

  // 3. Validate url: parse with new URL(); wrap parse errors; allow only http: and https:
  if (!input.url || typeof input.url !== "string") {
    throw new ValidationError("Invalid url: must be a non-empty string");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch (err) {
    throw new ValidationError(
      `Invalid URL: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ValidationError(
      `Invalid URL protocol: '${parsedUrl.protocol}'. Only http: and https: are allowed.`
    );
  }

  // 4. Validate checks (if provided): nonempty array of known IDs, with no duplicates
  if (input.checks !== undefined) {
    if (!Array.isArray(input.checks) || input.checks.length === 0) {
      throw new ValidationError("Invalid checks: must be a non-empty array of check IDs");
    }
    const seenChecks = new Set<CheckId>();
    for (const check of input.checks) {
      if (!allChecks.includes(check as CheckId)) {
        throw new ValidationError(
          `Invalid check ID: '${String(check)}'. Known IDs are: ${allChecks.join(", ")}`
        );
      }
      if (seenChecks.has(check as CheckId)) {
        throw new ValidationError(`Duplicate check ID: '${String(check)}'`);
      }
      seenChecks.add(check as CheckId);
    }
  }

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
          const timeoutMs = getCheckTimeout("axe", AXE_TIMEOUT_MS);
          const axe = await withTimeout(runAxe(page, input), timeoutMs, "axe");
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
        /**
         * Expected contrast check interface:
         * runContrastCheck(page: Page, input: AuditInput): Promise<AuditFinding[]>
         *
         * sampleContrast from ./contrast-sampler is dynamically imported and adapted
         * to this interface.
         */
        const modulePath = process.env.CONTRAST_MODULE_PATH || contrastModulePath;
        let contrastModule: any;
        try {
          contrastModule =
            contrastModuleOverride !== null
              ? contrastModuleOverride
              : await import(modulePath);
        } catch {
          checksExecuted.push({
            checkId,
            status: "skipped",
            error: "contrast module not available",
          });
          status = "incomplete";
          continue;
        }

        const runContrastCheckFn = contrastModule?.runContrastCheck;
        const sampleContrastFn = contrastModule?.sampleContrast;

        if (
          typeof runContrastCheckFn !== "function" &&
          typeof sampleContrastFn !== "function"
        ) {
          checksExecuted.push({
            checkId,
            status: "skipped",
            error: "contrast module not available",
          });
          status = "incomplete";
          continue;
        }

        try {
          const timeoutMs = getCheckTimeout("contrast", CONTRAST_TIMEOUT_MS);
          if (typeof runContrastCheckFn === "function") {
            const contrastFindings = await withTimeout(
              runContrastCheckFn(page, input),
              timeoutMs,
              "contrast"
            );
            if (Array.isArray(contrastFindings)) {
              findings.push(...contrastFindings);
            }
          } else {
            const finding = await withTimeout(
              runContrast(page, input, sampleContrastFn),
              timeoutMs,
              "contrast"
            );
            if (finding) findings.push(finding);
          }
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
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch {
      // Ignore if page already closed
    }
    try {
      await context.close();
    } catch {
      // Ignore if context already closed
    }
    await closeBrowser(browser);
  }

  // Deduplicate findings by fingerprint, keeping the first and preserving order
  const seenFingerprints = new Set<string>();
  const deduplicatedFindings: AuditFinding[] = [];
  for (const finding of findings) {
    if (!seenFingerprints.has(finding.fingerprint)) {
      seenFingerprints.add(finding.fingerprint);
      deduplicatedFindings.push(finding);
    }
  }

  return {
    auditId: input.auditId,
    url: input.url,
    status,
    findings: deduplicatedFindings,
    checksPlanned: planned,
    checksExecuted,
    axeSummary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
