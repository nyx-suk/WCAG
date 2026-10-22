import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, BrowserContext, Locator } from "playwright";
import type { AuditFinding, CheckId } from "./types";

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
