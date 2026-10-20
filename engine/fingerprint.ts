import { createHash } from "node:crypto";
import type { CheckId } from "./types";

/**
 * Generate a deterministic fingerprint for an audit finding.
 * Hashes normalized inputs (checkId, URL without hash fragments, and optional selector)
 * using SHA-256 and returns the first 16 hex characters.
 */
export function makeFingerprint(
  checkId: CheckId,
  url: string,
  selector?: string
): string {
  let normalizedUrl: string;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    normalizedUrl = parsed.toString();
  } catch {
    const hashIndex = url.indexOf("#");
    normalizedUrl = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  }

  const payload = `${checkId}:${normalizedUrl}:${selector ?? ""}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
