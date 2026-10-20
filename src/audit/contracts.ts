/** Shared contracts between the audit engine and individual accessibility checks. */

export interface BoundingBox {
  /** Screenshot-relative horizontal coordinate in CSS pixels. */
  x: number;
  /** Screenshot-relative vertical coordinate in CSS pixels. */
  y: number;
  width: number;
  height: number;
}

/** A rendered screenshot supplied to a check. Exactly one representation is needed. */
export type ScreenshotInput =
  | { kind: "path"; path: string; mimeType?: string }
  | { kind: "data"; data: Uint8Array; mimeType: string };

export interface ContrastCheckInput {
  checkId: "tc3-contrast";
  pageUrl: string;
  screenshot: ScreenshotInput;
  target: {
    /** Stable DOM selector when available; used to correlate findings across retests. */
    selector?: string;
    text: string;
    boundingBox: BoundingBox;
  };
  /** WCAG success criterion, e.g. "1.4.3" or "1.4.6". */
  wcagCriterion: string;
  /** Threshold required by the selected criterion and text size. */
  requiredRatio: number;
}

export type CheckStatus = "pass" | "fail" | "incomplete";
export type FindingSeverity = "critical" | "serious" | "moderate" | "minor";

export interface ContrastSample {
  /** Screenshot-relative coordinate in CSS pixels. */
  x: number;
  y: number;
  /** Sampled RGB color, each channel in the range 0–255. */
  rgb: [number, number, number];
  /** Relative luminance, normalized to 0–1. */
  relativeLuminance: number;
}

export interface ContrastEvidence {
  screenshot: ScreenshotInput;
  text: string;
  boundingBox: BoundingBox;
  /** Measured contrast ratio against the sampled background. */
  measuredRatio?: number;
  requiredRatio: number;
  wcagCriterion: string;
  samples: ContrastSample[];
  /** Optional annotated screenshot path or encoded image data. */
  annotatedScreenshot?: ScreenshotInput;
  method: string;
}

export interface ContrastCheckResult {
  status: CheckStatus;
  summary: string;
  evidence: ContrastEvidence;
  finding?: Omit<ProposedFinding, "id" | "auditId" | "pageUrl" | "evidence"> & {
    evidence?: ContrastEvidence;
  };
}

/** Checker-produced finding fields. The engine supplies the stable ID and audit linkage. */
export interface ProposedFinding {
  id: string;
  auditId: string;
  pageUrl: string;
  source: "axe" | "keyboard" | "contrast";
  ruleId?: string;
  wcagCriteria: string[];
  severity: FindingSeverity;
  title: string;
  description: string;
  selector?: string;
  evidence: unknown;
}

/** Stable identity inputs; run-specific evidence must not be included. */
export interface FindingIdentity {
  pageUrl: string;
  source: ProposedFinding["source"];
  ruleId?: string;
  wcagCriteria: string[];
  selector?: string;
  /** Stable fallback when a selector is unavailable, such as normalized text plus role. */
  elementFingerprint?: string;
}
