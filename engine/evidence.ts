import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, BrowserContext, Locator } from "playwright";
import type { AuditFinding, CheckId, TestRunRecord } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EVIDENCE_DIR = path.resolve(__dirname, "..", "evidence");

export interface ScreenshotOptions {
  auditId?: string;
  element?: Locator;
  fullPage?: boolean;
}

export interface EvidenceDirPaths {
  dir: string;
  relDir: string;
  toString(): string;
}

/**
 * Create and return paths for /evidence/{auditId}/.
 * Returns dir (absolute) and relDir (relative to /evidence).
 */
export async function buildEvidenceDir(
  auditId: string
): Promise<EvidenceDirPaths> {
  const targetDir = path.join(EVIDENCE_DIR, auditId);
  await fs.mkdir(targetDir, { recursive: true });

  return {
    dir: targetDir,
    relDir: auditId,
    toString: () => targetDir,
  };
}

/**
 * Save PNG screenshot under /evidence/{auditId}/{name}.png (or /evidence/{name}.png if no auditId),
 * and return the path relative to /evidence.
 */
export async function saveScreenshot(
  page: Page,
  auditIdOrName: string,
  nameOrOpts?: string | ScreenshotOptions,
  maybeOpts?: ScreenshotOptions
): Promise<string> {
  let auditId: string | undefined;
  let name: string;
  let opts: ScreenshotOptions | undefined;

  if (typeof nameOrOpts === "string") {
    // Called as: saveScreenshot(page, auditId, name, opts)
    auditId = auditIdOrName;
    name = nameOrOpts;
    opts = maybeOpts;
  } else {
    // Called as: saveScreenshot(page, name, opts)
    name = auditIdOrName;
    opts = nameOrOpts;
    auditId = opts?.auditId;
  }

  const filename = name.endsWith(".png") ? name : `${name}.png`;
  let targetPath: string;
  let relativePath: string;

  if (auditId) {
    const { dir } = await buildEvidenceDir(auditId);
    targetPath = path.join(dir, filename);
    relativePath = path.join(auditId, filename);
  } else if (name.includes("/") || name.includes("\\")) {
    targetPath = path.join(EVIDENCE_DIR, filename);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    relativePath = filename;
  } else {
    // Fallback directory for calls without an auditId
    const fallbackDir = path.join(EVIDENCE_DIR, "screenshots");
    await fs.mkdir(fallbackDir, { recursive: true });
    targetPath = path.join(fallbackDir, filename);
    relativePath = path.join("screenshots", filename);
  }

  if (opts?.element) {
    await opts.element.screenshot({ path: targetPath });
  } else {
    await page.screenshot({ path: targetPath, fullPage: opts?.fullPage ?? false });
  }

  return relativePath;
}

/**
 * Close page and context to finalize video recording, then move/rename the video
 * to /evidence/{auditId}/{checkId}.webm and return its relative path.
 */
export async function finalizeVideo(
  page: Page,
  context: BrowserContext,
  auditId: string,
  checkId: CheckId
): Promise<string> {
  const video = page.video();

  // Close page first to flush Playwright video file buffer
  if (!page.isClosed()) {
    await page.close();
  }
  // Close context to finalize writing
  await context.close();

  if (!video) {
    throw new Error(
      `No video recording found for check '${checkId}'. Make sure newAuditContext was called with record options.`
    );
  }

  const tempPath = await video.path();
  const { dir } = await buildEvidenceDir(auditId);
  const targetFilename = `${checkId}.webm`;
  const targetPath = path.join(dir, targetFilename);

  if (path.resolve(tempPath) !== path.resolve(targetPath)) {
    try {
      await fs.unlink(targetPath);
    } catch {
      // Safe to proceed if target file does not yet exist
    }
    await fs.rename(tempPath, targetPath);
  }

  return path.join(auditId, targetFilename);
}

/**
 * Temporarily highlight an element with an outline and return an async cleanup function
 * that restores the element's previous styles.
 */
export async function highlightElement(
  page: Page,
  selector: string
): Promise<() => Promise<void>> {
  const applied = await page.evaluate((sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return false;
    el.dataset.prevOutline = el.style.outline;
    el.dataset.prevOutlineOffset = el.style.outlineOffset;
    el.style.outline = "3px solid #dc2626";
    el.style.outlineOffset = "2px";
    return true;
  }, selector);

  return async () => {
    if (!applied || page.isClosed()) return;
    try {
      await page.evaluate((sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return;
        if (el.dataset.prevOutline !== undefined) {
          el.style.outline = el.dataset.prevOutline;
          delete el.dataset.prevOutline;
        } else {
          el.style.outline = "";
        }
        if (el.dataset.prevOutlineOffset !== undefined) {
          el.style.outlineOffset = el.dataset.prevOutlineOffset;
          delete el.dataset.prevOutlineOffset;
        } else {
          el.style.outlineOffset = "";
        }
      }, selector);
    } catch {
      // Ignore if page closed or navigated away
    }
  };
}

/**
 * Write raw detection data as JSON beside screenshots under /evidence/{auditId}/{name}.json
 * and return the relative path.
 */
export async function writeEvidenceJson(
  auditId: string,
  name: string,
  data: unknown
): Promise<string> {
  const { dir } = await buildEvidenceDir(auditId);
  const filename = name.endsWith(".json") ? name : `${name}.json`;
  const targetPath = path.join(dir, filename);
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2), "utf-8");
  return path.join(auditId, filename);
}

/**
 * In under six jargon-free lines, explain what happened, why it matters
 * to keyboard users, and which evidence file to open.
 */
export function describeFinding(finding: AuditFinding): string {
  const evidenceRef = finding.recording
    ? `evidence/${finding.recording}`
    : finding.screenshot
    ? `evidence/${finding.screenshot}`
    : "the evidence directory";

  let what = `An accessibility barrier was found on "${finding.selector ?? finding.title}".`;
  let impact = "Keyboard users are unable to navigate or operate this control.";

  if (finding.checkId === "keyboard-trap") {
    what = `Keyboard focus was trapped inside modal "${finding.selector}".`;
    impact = "Keyboard users cannot leave or dismiss the dialog using Tab, Shift+Tab, or Escape.";
  } else if (finding.checkId === "keyboard-operability") {
    what = `Custom control "${finding.selector}" responds to mouse clicks but cannot receive keyboard focus.`;
    impact = "Users navigating by keyboard or switch devices cannot reach or activate this button.";
  } else if (finding.checkId === "contrast") {
    what = `Text in "${finding.selector}" has insufficient contrast against its background image.`;
    impact = "Low-vision readers may be unable to read this content clearly.";
  } else if (finding.checkId === "axe") {
    what = `Automated rule violation: ${finding.title}.`;
    impact = "Assistive technology users may encounter unexpected behavior or navigation roadblocks.";
  }

  return [
    `Issue: ${what}`,
    `Impact: ${impact}`,
    `Evidence: Open ${evidenceRef} to view the captured evidence.`,
  ].join("\n");
}

export interface RecordOfficialTestRunOptions {
  record: TestRunRecord & { expected?: string; actual?: string };
  auditId?: string;
  store?: { recordTestRun: (record: TestRunRecord) => void };
}

/**
 * Shared synchronization helper across all official test runners (TC1–TC4):
 * 1. Persists record to SQLite test_runs table if store is provided.
 * 2. Writes individual test case report to /evidence/test-runs/<test_case>.json.
 * 3. Writes per-audit report to /evidence/<auditId>/official-report.json if auditId is provided.
 * 4. Upserts into aggregated test-runs.json in repo root and /evidence/test-runs.json.
 */
export async function recordOfficialTestRun(
  optionsOrRecord: RecordOfficialTestRunOptions | (TestRunRecord & { expected?: string; actual?: string }),
  maybeStore?: { recordTestRun: (record: TestRunRecord) => void },
  maybeAuditId?: string
): Promise<string> {
  const isOptions = (arg: any): arg is RecordOfficialTestRunOptions =>
    typeof arg === "object" && arg !== null && "record" in arg;

  const record: TestRunRecord & { expected?: string; actual?: string } = isOptions(optionsOrRecord)
    ? optionsOrRecord.record
    : optionsOrRecord;
  const store = isOptions(optionsOrRecord) ? optionsOrRecord.store : maybeStore;
  const auditId = isOptions(optionsOrRecord) ? optionsOrRecord.auditId : maybeAuditId;

  // 1. Persist to SQLite if store is provided
  if (store && typeof store.recordTestRun === "function") {
    store.recordTestRun(record);
  }

  // 2. Prepare serialized object with both expected/expected_result and actual/actual_result
  const serialized = {
    ...record,
    expected: record.expected ?? record.expected_result,
    actual: record.actual ?? record.actual_result,
  };

  // 3. Write individual test case report
  const testRunsDir = path.resolve(EVIDENCE_DIR, "test-runs");
  await fs.mkdir(testRunsDir, { recursive: true });
  const filename =
    record.test_case === "TC4"
      ? (record.id.includes("initial") || (record.input as any)?.state === "broken" || record.status === "fail"
          ? "TC4-initial.json"
          : "TC4-retest.json")
      : `${record.test_case}.json`;
  const targetFile = path.join(testRunsDir, filename);
  await fs.writeFile(targetFile, JSON.stringify(serialized, null, 2), "utf-8");
  if (record.test_case === "TC4") {
    await fs.writeFile(path.join(testRunsDir, "TC4.json"), JSON.stringify(serialized, null, 2), "utf-8");
  }

  // 4. Write per-audit official-report.json if auditId is provided
  const targetAuditId = auditId ?? (record.evidence as any)?.auditId ?? (record.input as any)?.auditId;
  if (targetAuditId) {
    const auditDir = path.resolve(EVIDENCE_DIR, targetAuditId);
    await fs.mkdir(auditDir, { recursive: true });
    await fs.writeFile(path.join(auditDir, "official-report.json"), JSON.stringify(serialized, null, 2), "utf-8");
  }

  // Helper to distinguish distinct runs per test case (e.g. TC4 initial vs retest)
  const getRecordKey = (item: any): string => {
    if (item?.test_case === "TC4") {
      const id = String(item?.id ?? "");
      const state = (item?.input as any)?.state;
      if (id.includes("initial") || state === "broken" || item?.status === "fail") {
        return "TC4:initial";
      }
      if (id.includes("retest") || state === "fixed") {
        return "TC4:retest";
      }
      return `TC4:${id}`;
    }
    return item?.test_case ?? String(item?.id ?? "unknown");
  };

  // 5. Upsert into aggregated test-runs.json in root and evidence/
  const recordsMap = new Map<string, any>();
  const locations = [
    path.resolve(EVIDENCE_DIR, "..", "test-runs.json"),
    path.resolve(EVIDENCE_DIR, "test-runs.json"),
  ];

  for (const loc of locations) {
    try {
      const content = await fs.readFile(loc, "utf-8");
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.test_case) {
            recordsMap.set(getRecordKey(item), item);
          }
        }
      }
    } catch {
      // ignore if file doesn't exist yet
    }
  }

  // Also read any existing individual files in /evidence/test-runs/*.json
  try {
    const files = await fs.readdir(testRunsDir);
    for (const f of files) {
      if (f.endsWith(".json")) {
        try {
          const content = await fs.readFile(path.join(testRunsDir, f), "utf-8");
          const item = JSON.parse(content);
          if (item?.test_case) {
            recordsMap.set(getRecordKey(item), item);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  recordsMap.set(getRecordKey(serialized), serialized);

  const combined = Array.from(recordsMap.values()).sort((a, b) => {
    const tcDiff = a.test_case.localeCompare(b.test_case);
    if (tcDiff !== 0) return tcDiff;
    return (a.started_at ?? "").localeCompare(b.started_at ?? "");
  });

  await fs.writeFile(path.resolve(EVIDENCE_DIR, "..", "test-runs.json"), JSON.stringify(combined, null, 2), "utf-8");
  await fs.writeFile(path.resolve(EVIDENCE_DIR, "test-runs.json"), JSON.stringify(combined, null, 2), "utf-8");

  return targetFile;
}

