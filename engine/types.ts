/**
 * Core type definitions for the WCAG Accessibility Auditor Engine.
 * Shared contract between Person A (Audit Engine) and Person B (Persistence / UI / Retest).
 */

export type Severity = "critical" | "serious" | "moderate" | "minor";
export type CheckId = "axe" | "keyboard-trap" | "keyboard-operability" | "contrast";

export type AuditInput = {
  url: string;
  wcagLevel: "A" | "AA" | "AAA";
  auditId: string;
  checks?: CheckId[]; // if provided, run only these (used by retests)
};

export interface AxeNode {
  html: string;
  target: string[];
  failureSummary?: string;
}

export interface AxeEvidence {
  ruleId: string;
  impact: string | null;
  helpUrl: string;
  nodes: AxeNode[];
}

export interface KeyboardTrapEvidence {
  opener?: string;
  tabSequence: string[];
  cycleDetected: boolean;
  cycleLength?: number;
  escapePressed: boolean;
  modalStillOpenAfterEscape: boolean;
  dismissControlsFound: string[];
  dismissControlsWorked: boolean;
}

export interface KeyboardOperabilityEvidence {
  selector: string;
  html: string;
  cursorPointer: boolean;
  hasClickHandler: boolean;
  reachableByTab: boolean;
  tabsPressed: number;
  enterActivated: boolean;
  spaceActivated: boolean;
}

/** Placeholder for TC3 visual contrast evidence; owned by Person B. */
export type ContrastEvidence = unknown;

export type EvidenceByCheckId = {
  axe: AxeEvidence;
  "keyboard-trap": KeyboardTrapEvidence;
  "keyboard-operability": KeyboardOperabilityEvidence;
  contrast: ContrastEvidence;
};

export type AuditFinding = {
  title: string;
  description: string;
  wcagRule: string;        // e.g. "2.1.2 No Keyboard Trap"
  severity: Severity;
  source: CheckId;
  checkId: CheckId;
  fingerprint: string;     // stable hash of checkId + url + element selector, for dedupe/retest matching
  selector?: string;
  screenshot?: string;     // path relative to /evidence
  recording?: string;      // path relative to /evidence
  evidence: unknown;       // shape depends on source; see engine/types.ts
};

export type CheckStatus = "executed" | "failed" | "skipped";

export type AuditResult = {
  auditId: string;
  url: string;
  status: "complete" | "incomplete" | "error";
  findings: AuditFinding[];
  checksPlanned: CheckId[];
  checksExecuted: { checkId: CheckId; status: CheckStatus; error?: string }[];
  axeSummary?: { violationCount: number; passesCount: number; incompleteCount: number };
  startedAt: string;
  completedAt: string;
};

export type RunAudit = (input: AuditInput) => Promise<AuditResult>;
