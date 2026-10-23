/**
 * Public entrypoint for the WCAG Accessibility Auditor Engine.
 */

export { runAudit } from "./runAudit";

export type {
  AuditInput,
  AuditResult,
  AuditFinding,
  AuditPlan,
  AuditStepLog,
  PlannedCheck,
  CheckId,
  CheckStatus,
  Severity,
  AxeNode,
  AxeEvidence,
  KeyboardTrapEvidence,
  KeyboardOperabilityEvidence,
  ContrastEvidence,
  EvidenceByCheckId,
  RunAudit,
  TestCaseId,
  TestRunStatus,
  TestRunRecord,
} from "./types";

export {
  ValidationError,
  NavigationError,
  CheckTimeoutError,
  CheckFailedError,
} from "./errors";

export { makeFingerprint } from "./fingerprint";
