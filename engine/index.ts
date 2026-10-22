/**
 * Public entrypoint for the WCAG Accessibility Auditor Engine.
 */

export { runAudit } from "./runAudit";

export type {
  AuditInput,
  AuditResult,
  AuditFinding,
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
} from "./types";

export {
  ValidationError,
  NavigationError,
  CheckTimeoutError,
  CheckFailedError,
} from "./errors";

export { makeFingerprint } from "./fingerprint";
