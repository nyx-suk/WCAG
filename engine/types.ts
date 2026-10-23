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

export interface PlannedCheck {
  checkId: CheckId;
  reason: string;
}

export interface AuditPlan {
  summary: string;
  checks: PlannedCheck[];
}

export interface AuditStepLog {
  step: "collect" | "plan" | "find" | "act";
  status: "complete" | "in_progress" | "pending" | "failed";
  timestamp: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface CheckExecution {
  checkId: CheckId;
  status: CheckStatus;
  error?: string;
}

export type AuditResult = {
  auditId: string;
  url: string;
  status: "complete" | "incomplete" | "error";
  findings: AuditFinding[];
  checksPlanned: CheckId[];
  checksExecuted: CheckExecution[];
  checkDurations?: Partial<Record<CheckId, number>>;
  plan?: AuditPlan;
  steps?: AuditStepLog[];
  axeSummary?: { violationCount: number; passesCount: number; incompleteCount: number };
  startedAt: string;
  completedAt: string;
  error?: string;
};

export type RunAudit = (input: AuditInput) => Promise<AuditResult>;

export type TestCaseId = "TC1" | "TC2" | "TC3" | "TC4";
export type TestRunStatus = "pass" | "fail" | "incomplete";

export interface TestRunRecord<
  TInput = unknown,
  TExpected = unknown,
  TActual = unknown,
  TEvidence = unknown,
> {
  id: string;
  test_case: TestCaseId;
  input: TInput;
  expected_result: TExpected;
  actual_result: TActual;
  evidence: TEvidence;
  status: TestRunStatus;
  explanation?: string | null;
  started_at: string;
  completed_at: string;
}

