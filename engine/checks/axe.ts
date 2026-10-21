import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import { makeFingerprint } from "../fingerprint";
import { CheckFailedError } from "../errors";
import { withTimeout } from "../browser";
import type { AuditFinding, AxeEvidence, Severity } from "../types";

export interface AxeCheckInput {
  wcagLevel: "A" | "AA" | "AAA";
  url: string;
  auditId: string;
}

export interface AxeCheckResult {
  findings: AuditFinding[];
  summary: {
    violationCount: number;
    passesCount: number;
    incompleteCount: number;
  };
}

/**
 * Map WCAG conformance level to axe-core rule tags.
 * Note: Axe-core's WCAG AAA coverage is partial and does not encompass all AAA criteria.
 */
export function getTagsForLevel(level: "A" | "AA" | "AAA"): string[] {
  const levelATags = ["wcag2a", "wcag21a"];
  const levelAATags = [...levelATags, "wcag2aa", "wcag21aa", "wcag22aa"];
  // Axe AAA coverage is partial; include wcag2aaa tag
  const levelAAATags = [...levelAATags, "wcag2aaa"];

  switch (level) {
    case "A":
      return levelATags;
    case "AA":
      return levelAATags;
    case "AAA":
      return levelAAATags;
  }
}

/**
 * Derive WCAG rule criterion from rule tags when available (e.g. "wcag143" -> "1.4.3").
 * Returns undefined if no specific criterion tag is found.
 */
export function deriveWcagRule(tags: string[]): string | undefined {
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d{1,2})$/i.exec(tag);
    if (match && match[1] && match[2] && match[3]) {
      return `${match[1]}.${match[2]}.${match[3]}`;
    }
  }
  return undefined;
}

/**
 * Execute automated axe-core checks on a loaded page.
 * Returns one AuditFinding per violated rule with complete node-level AxeEvidence.
 */
export async function runAxeCheck(
  page: Page,
  input: AxeCheckInput
): Promise<AxeCheckResult> {
  const execute = async (): Promise<AxeCheckResult> => {
    const tags = getTagsForLevel(input.wcagLevel);
    const axeResults = await new AxeBuilder({ page }).withTags(tags).analyze();

    const findings: AuditFinding[] = axeResults.violations.map((violation) => {
      const firstNode = violation.nodes[0];
      const firstSelector = firstNode
        ? Array.isArray(firstNode.target)
          ? firstNode.target.join(" ")
          : String(firstNode.target)
        : "";

      const selectorForFp = firstSelector
        ? `${violation.id} ${firstSelector}`
        : violation.id;

      const fingerprint = makeFingerprint("axe", input.url, selectorForFp);
      const wcagRule = deriveWcagRule(violation.tags) ?? violation.id;
      const severity: Severity = (violation.impact as Severity) ?? "moderate";

      const evidence: AxeEvidence = {
        ruleId: violation.id,
        impact: violation.impact ?? null,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map((node) => ({
          html: node.html,
          target: node.target.map(String),
          failureSummary: node.failureSummary,
        })),
      };

      return {
        title: violation.help,
        description: violation.description,
        wcagRule,
        severity,
        source: "axe",
        checkId: "axe",
        fingerprint,
        selector: firstSelector || undefined,
        evidence,
      };
    });

    return {
      findings,
      summary: {
        violationCount: axeResults.violations.length,
        passesCount: axeResults.passes.length,
        incompleteCount: axeResults.incomplete.length,
      },
    };
  };

  try {
    return await withTimeout(execute(), 30000, "axe");
  } catch (err) {
    if (err instanceof CheckFailedError) {
      throw err;
    }
    throw new CheckFailedError(
      `Axe check failed: ${err instanceof Error ? err.message : String(err)}`,
      { checkId: "axe", cause: err }
    );
  }
}
