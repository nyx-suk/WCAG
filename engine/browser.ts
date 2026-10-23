import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
} from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NavigationError, CheckTimeoutError } from "./errors";
import type { CheckId } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { EVIDENCE_DIR } from "./evidence";

export const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, "screenshots");
export const RECORDINGS_DIR = path.join(EVIDENCE_DIR, "recordings");

let defaultBrowser: Browser | null = null;

/**
 * Launch Chromium.
 * Defaults to headless; setting HEADLESS=false in the environment opens the browser UI for debugging.
 */
export async function launchBrowser(): Promise<Browser> {
  const headless = process.env.HEADLESS !== "false";
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ];
  const browser = await chromium.launch({ headless, args });
  defaultBrowser = browser;
  return browser;
}

export async function closeBrowser(browser: Browser): Promise<void> {
  if (browser === defaultBrowser) defaultBrowser = null;
  await browser.close();
}

export interface AuditContextOptions {
  record?: {
    dir?: string;
  };
}

/**
 * NOTE ON VIDEO RECORDING:
 * In Playwright, video recording is configured per BrowserContext at creation time.
 * Because of this, keyboard interaction checks (such as TC1) that require video evidence
 * must run in their own dedicated BrowserContext, separate from axe-core scans or static
 * checks. This isolates recording overhead and ensures clean, per-check video artifacts.
 *
 * Creates a browser context with a deterministic fixed 1280x720 viewport.
 * When recording is requested, captures video at 1280x720 in the specified directory (defaults to /evidence/recordings).
 */
export async function newAuditContext(
  browserOrOpts?: Browser | AuditContextOptions,
  opts?: AuditContextOptions
): Promise<BrowserContext> {
  let browser: Browser;
  let options: AuditContextOptions | undefined;

  if (
    browserOrOpts &&
    "newContext" in browserOrOpts &&
    typeof browserOrOpts.newContext === "function"
  ) {
    browser = browserOrOpts as Browser;
    options = opts;
  } else {
    browser = defaultBrowser ?? (await launchBrowser());
    options = browserOrOpts as AuditContextOptions | undefined;
  }

  const contextOptions: Parameters<Browser["newContext"]>[0] = {
    viewport: { width: 1280, height: 720 },
  };

  if (options?.record) {
    const recordDir = options.record.dir ?? RECORDINGS_DIR;
    await fs.mkdir(recordDir, { recursive: true });
    contextOptions.recordVideo = {
      dir: recordDir,
      size: { width: 1280, height: 720 },
    };
  }

  return browser.newContext(contextOptions);
}

export interface NavigateOptions {
  timeoutMs?: number;
  checkId?: CheckId;
}

/**
 * Navigate to a URL using waitUntil: "load".
 * Throws a typed NavigationError on navigation timeout, network failure, or HTTP status >= 400.
 * Never swallows errors.
 */
export async function navigate(
  page: Page,
  url: string,
  opts?: NavigateOptions
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const checkId: CheckId = opts?.checkId ?? "axe";

  try {
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout: timeoutMs,
    });

    if (!response) {
      throw new NavigationError(`Navigation to ${url} produced no response`, {
        checkId,
      });
    }

    if (response.status() >= 400) {
      throw new NavigationError(
        `Navigation to ${url} failed with HTTP status ${response.status()}`,
        { checkId }
      );
    }
  } catch (err) {
    if (err instanceof NavigationError) {
      throw err;
    }
    throw new NavigationError(
      `Navigation to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      { checkId, cause: err }
    );
  }
}

export {
  EVIDENCE_DIR,
  buildEvidenceDir,
  saveScreenshot,
  finalizeVideo,
  highlightElement,
  writeEvidenceJson,
  describeFinding,
  type ScreenshotOptions,
} from "./evidence";

/**
 * Enforce a timeout on a promise.
 * Rejects with a typed CheckTimeoutError if the timeout elapses before the promise resolves.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  checkId: CheckId
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new CheckTimeoutError(`Check '${checkId}' timed out after ${ms}ms`, {
          checkId,
        })
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
