import { createHash } from "node:crypto";
import type { FindingIdentity } from "./contracts";

/**
 * Build a deterministic issue ID that remains the same across audit runs.
 * Evidence, timestamps, and audit IDs are deliberately excluded.
 */
export function createStableFindingId(identity: FindingIdentity): string {
  const element = identity.selector ?? identity.elementFingerprint;
  if (!element) {
    throw new Error("A selector or stable elementFingerprint is required to identify a finding.");
  }

  let pageUrl: string;
  try {
    const parsed = new URL(identity.pageUrl);
    parsed.hash = "";
    pageUrl = parsed.toString();
  } catch {
    pageUrl = identity.pageUrl;
  }

  const key = JSON.stringify({
    pageUrl,
    source: identity.source,
    ruleId: identity.ruleId ?? "",
    wcagCriteria: [...identity.wcagCriteria].sort(),
    element,
  });
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `fnd_${digest}`;
}
