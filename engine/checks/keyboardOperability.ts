import type { Browser, BrowserContext, Page, CDPSession } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import {
  newAuditContext,
  navigate,
  finalizeVideo,
  saveScreenshot,
  withTimeout,
  EVIDENCE_DIR,
} from "../browser";
import { makeFingerprint } from "../fingerprint";
import { CheckFailedError } from "../errors";
import type { AuditFinding, KeyboardOperabilityEvidence } from "../types";

export interface KeyboardOperabilityCheckInput {
  url: string;
  auditId: string;
  browser: Browser;
}

interface CandidateControl {
  selector: string;
  html: string;
  cursorPointer: boolean;
  hasOnClickAttr: boolean;
}

/**
 * Run keyboard operability audit check (WCAG 2.1.1 Level A & WCAG 4.1.2 Level A).
 * Detects custom mouse-operable controls (e.g. styled <div> buttons) that cannot
 * be reached or activated by keyboard, even when automated scanners like axe-core
 * report zero violations.
 */
export async function runKeyboardOperabilityCheck(
  ctx: KeyboardOperabilityCheckInput
): Promise<AuditFinding[]> {
  const execute = async (): Promise<AuditFinding[]> => {
    // Step 1: Use a dedicated video-recording browser context and navigate
    const context: BrowserContext = await newAuditContext(ctx.browser, {
      record: {},
    });
    const page: Page = await context.newPage();

    let videoRelPath: string | null = null;
    let findingReported = false;
    let contextClosed = false;

    try {
      await navigate(page, ctx.url, { checkId: "keyboard-operability" });

      // Step 2: Find up to 20 visible candidate elements that are NOT natively
      // interactive, NOT tabbable, and NOT descendants of interactive elements,
      // but show signs of interactivity (cursor: pointer, onclick attribute, etc.)
      const rawCandidates = await page.evaluate<CandidateControl[]>(`
        (() => {
          const nativeInteractiveTags = new Set([
            "a", "button", "input", "select", "textarea", "summary", "details"
          ]);

          const isNative = (el) => {
            const tag = el.tagName.toLowerCase();
            return nativeInteractiveTags.has(tag) || el.isContentEditable;
          };

          const isDescendant = (el) => {
            let parent = el.parentElement;
            while (parent) {
              if (isNative(parent)) return true;
              parent = parent.parentElement;
            }
            return false;
          };

          const isTabbable = (el) => {
            const tabIndex = el.getAttribute("tabindex");
            return tabIndex !== null && !isNaN(Number(tabIndex)) && Number(tabIndex) >= 0;
          };

          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0"
            );
          };

          const allElements = Array.from(document.querySelectorAll("*"));
          const matches = [];

          for (const el of allElements) {
            if (isNative(el)) continue;
            if (isDescendant(el)) continue;
            if (isTabbable(el)) continue;
            if (!isVisible(el)) continue;

            const style = window.getComputedStyle(el);
            const cursorPointer = style.cursor === "pointer";
            const hasOnClickAttr =
              el.hasAttribute("onclick") || el.getAttribute("role") === "button";

            if (cursorPointer || hasOnClickAttr) {
              let selector = el.id ? "#" + el.id : "";
              if (!selector) {
                const tag = el.tagName.toLowerCase();
                const cls = typeof el.className === "string" && el.className.trim()
                  ? "." + el.className.trim().split(/\\s+/).join(".")
                  : "";
                selector = tag + cls;
              }

              matches.push({
                selector,
                html: el.outerHTML.slice(0, 300),
                cursorPointer,
                hasOnClickAttr,
              });

              if (matches.length >= 20) break;
            }
          }

          return matches;
        })()
      `);

      if (rawCandidates.length === 0) {
        return [];
      }

      // Detect event listeners via Chrome DevTools Protocol (CDP) DOMDebugger.getEventListeners
      let cdpClient: CDPSession | null = null;
      try {
        cdpClient = await page.context().newCDPSession(page);
      } catch {
        // Fall back gracefully if CDP is unavailable
      }

      // Check click listener status on each candidate
      const candidates: (CandidateControl & { hasClickListener: boolean })[] = [];
      for (const cand of rawCandidates) {
        let hasCdpClickListener = false;
        if (cdpClient) {
          try {
            const { result } = await cdpClient.send("Runtime.evaluate", {
              expression: `document.querySelector(${JSON.stringify(cand.selector)})`,
              returnByValue: false,
            });

            if (result.objectId) {
              const { listeners } = await cdpClient.send(
                "DOMDebugger.getEventListeners",
                { objectId: result.objectId }
              );
              hasCdpClickListener = listeners.some(
                (l: { type: string }) => l.type === "click"
              );
            }
          } catch {
            // Gracefully ignore CDP evaluation errors on individual elements
          }
        }

        candidates.push({
          ...cand,
          hasClickListener: cand.hasOnClickAttr || hasCdpClickListener,
        });
      }

      // Count tabbable elements on the page to determine Tab-walk budget
      const tabbableCount = await page.evaluate<number>(`
        (() => {
          const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
          return Array.from(document.querySelectorAll(sel)).filter((el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          }).length;
        })()
      `);

      const maxWalkTabs = tabbableCount + 2;
      const findings: AuditFinding[] = [];

      // Step 3: For each candidate, Tab-walk from page start and test responsiveness
      for (let index = 0; index < candidates.length; index++) {
        const cand = candidates[index];

        // Reset document focus to start before walking
        await page.evaluate(`
          (() => {
            window.scrollTo(0, 0);
            if (document.activeElement && document.activeElement !== document.body) {
              document.activeElement.blur();
            }
          })()
        `);

        let reachableByTab = false;
        let tabsPressed = 0;

        for (let t = 0; t < maxWalkTabs; t++) {
          await page.keyboard.press("Tab");
          tabsPressed++;

          const isFocused = await page.evaluate<boolean>(`
            ((sel) => {
              const target = document.querySelector(sel);
              return target ? document.activeElement === target : false;
            })(${JSON.stringify(cand.selector)})
          `);

          if (isFocused) {
            reachableByTab = true;
            break;
          }
        }

        // Since the element cannot receive focus, keyboard Enter/Space cannot activate it
        const enterActivated = false;
        const spaceActivated = false;

        // Distinguish genuine custom controls from purely decorative elements:
        // Set up mutation observer, then click with mouse and confirm it responds
        await page.evaluate(`
          (() => {
            window.__controlResponded = false;
            const observer = new MutationObserver(() => {
              window.__controlResponded = true;
            });
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              characterData: true,
            });
            window.__controlObserver = observer;
          })()
        `);

        // Click with mouse
        await page.click(cand.selector);
        await new Promise((r) => setTimeout(r, 100));

        const respondedToClick = await page.evaluate<boolean>(`
          (() => {
            if (window.__controlObserver) {
              window.__controlObserver.disconnect();
            }
            return Boolean(window.__controlResponded);
          })()
        `);

        const isActionable = cand.hasClickListener || respondedToClick;

        // Step 4: Report only candidates that respond to mouse clicks but are NOT keyboard reachable
        if (isActionable && !reachableByTab) {
          // Temporarily outline the offending element for visual evidence
          await page.evaluate(`
            ((sel) => {
              const el = document.querySelector(sel);
              if (el) {
                el.dataset.oldOutline = el.style.outline;
                el.style.outline = "3px solid #dc2626";
                el.style.outlineOffset = "2px";
              }
            })(${JSON.stringify(cand.selector)})
          `);

          const screenshotPath = await saveScreenshot(
            page,
            `${ctx.auditId}-operability-${index}`
          );

          // Restore element outline
          await page.evaluate(`
            ((sel) => {
              const el = document.querySelector(sel);
              if (el) {
                el.style.outline = el.dataset.oldOutline || "";
                delete el.dataset.oldOutline;
              }
            })(${JSON.stringify(cand.selector)})
          `);

          // Finalize Tab-walk video recording if not yet finalized
          if (!videoRelPath) {
            videoRelPath = await finalizeVideo(
              page,
              context,
              ctx.auditId,
              "keyboard-operability"
            );
            contextClosed = true;
          }

          findingReported = true;

          const evidence: KeyboardOperabilityEvidence = {
            selector: cand.selector,
            html: cand.html,
            cursorPointer: cand.cursorPointer,
            hasClickHandler: isActionable,
            reachableByTab,
            tabsPressed,
            enterActivated,
            spaceActivated,
          };

          findings.push({
            title: "Custom control is not keyboard operable",
            description: `Custom control '${cand.selector}' responds to mouse clicks but cannot receive keyboard focus or activation. All interactive controls must be operable through a keyboard interface without requiring specific timings.`,
            wcagRule: "2.1.1 Keyboard",
            severity: "serious",
            source: "keyboard-operability",
            checkId: "keyboard-operability",
            selector: cand.selector,
            screenshot: screenshotPath,
            recording: videoRelPath,
            fingerprint: makeFingerprint(
              "keyboard-operability",
              ctx.url,
              cand.selector
            ),
            evidence,
          });
        }
      }

      return findings;
    } finally {
      // Step 6: Always finalize video in finally; delete recording if no findings
      if (!contextClosed) {
        try {
          const tempVideoPath = await finalizeVideo(
            page,
            context,
            ctx.auditId,
            "keyboard-operability"
          );
          contextClosed = true;
          if (!findingReported && tempVideoPath) {
            const fullPath = path.join(EVIDENCE_DIR, tempVideoPath);
            await fs.unlink(fullPath).catch(() => {});
          }
        } catch {
          // Context or page already closed
        }
      }
    }
  };

  try {
    return await withTimeout(execute(), 45000, "keyboard-operability");
  } catch (err) {
    if (err instanceof CheckFailedError) {
      throw err;
    }
    throw new CheckFailedError(
      `Keyboard operability check failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { checkId: "keyboard-operability", cause: err }
    );
  }
}
