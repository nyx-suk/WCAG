import type { Browser, Page, BrowserContext } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import {
  newAuditContext,
  navigate,
  withTimeout,
  EVIDENCE_DIR,
} from "../browser";
import {
  saveScreenshot,
  finalizeVideo,
  writeEvidenceJson,
} from "../evidence";
import { makeFingerprint } from "../fingerprint";
import { CheckFailedError } from "../errors";
import type { AuditFinding, KeyboardTrapEvidence } from "../types";

export interface KeyboardTrapCheckInput {
  url: string;
  auditId: string;
  browser: Browser;
}

interface DialogInfo {
  selector: string;
  isModal: boolean;
}

interface FocusDescriptor {
  tag: string;
  id: string;
  text: string;
  selector: string;
  formatted: string;
}

/**
 * Run keyboard trap audit check (WCAG 2.1.2 Level A).
 * Uses a dedicated video-recording context to capture browser interactions.
 * Distinguishes expected modal focus containment from a genuine keyboard trap.
 */
export async function runKeyboardTrapCheck(
  ctx: KeyboardTrapCheckInput
): Promise<AuditFinding[]> {
  const execute = async (): Promise<AuditFinding[]> => {
    // A dedicated context is required because video recording in Playwright is per-context
    const context: BrowserContext = await newAuditContext(ctx.browser, {
      record: {},
    });
    const page: Page = await context.newPage();

    let videoRelPath: string | null = null;
    let findingReported = false;
    let contextClosed = false;

    try {
      // Step 1: Navigate to the target URL
      await navigate(page, ctx.url, { checkId: "keyboard-trap" });

      // Step 2: Find up to 5 visible, focusable dialog opener candidates
      // Candidates have aria-haspopup="dialog", aria-controls referencing a dialog,
      // or text/attributes matching /open|modal|dialog|signup|subscribe|menu/i
      const openerSelectors: string[] = await page.evaluate(() => {
        const focusableCandidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a[href], [role="button"], input[type="button"], input[type="submit"], [tabindex]:not([tabindex="-1"])'
          )
        );

        const regex = /open|modal|dialog|signup|subscribe|menu/i;

        const matches = focusableCandidates.filter((el) => {
          // Element must be visible
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (
            rect.width === 0 ||
            rect.height === 0 ||
            style.display === "none" ||
            style.visibility === "hidden"
          ) {
            return false;
          }

          if (el.getAttribute("aria-haspopup") === "dialog") return true;

          const controls = el.getAttribute("aria-controls");
          if (controls) {
            const target = document.getElementById(controls);
            if (
              target &&
              (target.getAttribute("role") === "dialog" ||
                target.hasAttribute("aria-modal"))
            ) {
              return true;
            }
          }

          const text = el.innerText || el.textContent || "";
          const ariaLabel = el.getAttribute("aria-label") || "";
          const id = el.id || "";
          const className = typeof el.className === "string" ? el.className : "";

          return (
            regex.test(text) ||
            regex.test(ariaLabel) ||
            regex.test(id) ||
            regex.test(className)
          );
        });

        // Return up to 5 unique CSS selectors
        return matches.slice(0, 5).map((el) => {
          if (el.id) return `#${el.id}`;
          const tag = el.tagName.toLowerCase();
          const text = (el.innerText || "").trim().slice(0, 15);
          return text ? `${tag}:has-text("${text}")` : tag;
        });
      });

      // If no openers found, return no findings
      if (openerSelectors.length === 0) {
        return [];
      }

      // Step 3: Test each opener candidate by focusing and pressing Enter (never click)
      for (const openerSelector of openerSelectors) {
        // Focus opener and activate with keyboard Enter
        await page.focus(openerSelector);
        await page.keyboard.press("Enter");

        // Wait up to 1 second for dialog or overlay to become visible
        let activeDialog: DialogInfo | null = null;
        for (let waitStep = 0; waitStep < 10; waitStep++) {
          activeDialog = await page.evaluate((): DialogInfo | null => {
            const candidates = Array.from(
              document.querySelectorAll<HTMLElement>(
                '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]'
              )
            );

            for (const el of candidates) {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              if (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0
              ) {
                const selector = el.id
                  ? `#${el.id}`
                  : el.getAttribute("role")
                  ? `[role="${el.getAttribute("role")}"]`
                  : el.tagName.toLowerCase();
                const isModal =
                  el.getAttribute("aria-modal") === "true" ||
                  el.tagName.toLowerCase() === "dialog";
                return { selector, isModal };
              }
            }
            return null;
          });

          if (activeDialog) break;
          await new Promise((r) => setTimeout(r, 100));
        }

        // If no dialog appeared, continue to next opener
        if (!activeDialog) {
          continue;
        }

        const dialogSelector = activeDialog.selector;

        // Count focusable descendants inside the dialog to calibrate Tab loop length
        const focusableCount: number = await page.evaluate((dSel: string) => {
          const dialog = document.querySelector(dSel);
          if (!dialog) return 0;
          const focusables = dialog.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          return focusables.length;
        }, dialogSelector);

        // Step 4: Record focus descriptors during Tab presses
        // Maximum tabs = max(6, focusableDescendantCount + 3)
        const maxTabs = Math.max(6, focusableCount + 3);
        const tabSequence: string[] = [];
        let focusEscaped = false;

        const getActiveDescriptor = async (): Promise<FocusDescriptor> => {
          return page.evaluate((): FocusDescriptor => {
            const active = document.activeElement;
            if (!active || active === document.body) {
              return {
                tag: "body",
                id: "",
                text: "",
                selector: "body",
                formatted: "body",
              };
            }
            const tag = active.tagName.toLowerCase();
            const id = active.id ? `#${active.id}` : "";
            const text = (
              (active as HTMLElement).innerText ||
              active.textContent ||
              active.getAttribute("aria-label") ||
              active.getAttribute("name") ||
              ""
            )
              .trim()
              .slice(0, 30);
            const selector = active.id
              ? `#${active.id}`
              : `${tag}${text ? `:has-text("${text}")` : ""}`;
            const formatted = `${tag}${id}${text ? ` "${text}"` : ""}`;
            return { tag, id, text, selector, formatted };
          });
        };

        const isFocusInsideDialog = async (): Promise<boolean> => {
          return page.evaluate((dSel: string) => {
            const dialog = document.querySelector(dSel);
            if (!dialog) return false;
            const active = document.activeElement;
            return active ? dialog.contains(active) : false;
          }, dialogSelector);
        };

        // Tab forward navigation
        for (let i = 0; i < maxTabs; i++) {
          await page.keyboard.press("Tab");
          const desc = await getActiveDescriptor();
          tabSequence.push(desc.formatted);

          const inside = await isFocusInsideDialog();
          if (!inside) {
            focusEscaped = true;
            break;
          }
        }

        // Also record 3 Shift+Tab presses
        if (!focusEscaped) {
          for (let i = 0; i < 3; i++) {
            await page.keyboard.press("Shift+Tab");
            const desc = await getActiveDescriptor();
            tabSequence.push(`Shift+Tab -> ${desc.formatted}`);

            const inside = await isFocusInsideDialog();
            if (!inside) {
              focusEscaped = true;
              break;
            }
          }
        }

        // Step 5: If focus left the dialog subtree, it is not trapped
        if (focusEscaped) {
          continue;
        }

        // Check for cycle: see if elements repeat within the Tab sequence
        const seen = new Map<string, number>();
        let cycleDetected = false;
        let cycleLength: number | undefined;

        for (let idx = 0; idx < tabSequence.length; idx++) {
          const item = tabSequence[idx];
          if (seen.has(item)) {
            cycleDetected = true;
            cycleLength = idx - (seen.get(item) as number);
            break;
          }
          seen.set(item, idx);
        }

        // Step 6: Test keyboard exit mechanisms
        // Test Escape key first
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 100));

        const isStillVisible = async (): Promise<boolean> => {
          return page.evaluate((dSel: string) => {
            const el = document.querySelector<HTMLElement>(dSel);
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0" &&
              rect.width > 0 &&
              rect.height > 0
            );
          }, dialogSelector);
        };

        const modalStillOpenAfterEscape = await isStillVisible();
        const escapePressed = true;

        // If Escape dismissed the modal, this is valid modal containment, NOT a trap!
        if (!modalStillOpenAfterEscape) {
          continue;
        }

        // Test each focusable control in the dialog using Enter and Space
        const dismissControlsFound: string[] = await page.evaluate(
          (dSel: string) => {
            const dialog = document.querySelector(dSel);
            if (!dialog) return [];
            const buttons = Array.from(
              dialog.querySelectorAll<HTMLElement>(
                'button, [role="button"], a[href], input[type="button"], input[type="submit"]'
              )
            );
            return buttons.map((b) => {
              if (b.id) return `#${b.id}`;
              const text = (b.innerText || "").trim().slice(0, 20);
              return text ? `button:has-text("${text}")` : b.tagName.toLowerCase();
            });
          },
          dialogSelector
        );

        let dismissControlsWorked = false;

        for (const ctrlSelector of dismissControlsFound) {
          // Focus the control
          const focused = await page.evaluate((cSel: string) => {
            const el = document.querySelector<HTMLElement>(cSel);
            if (el) {
              el.focus();
              return true;
            }
            return false;
          }, ctrlSelector);

          if (!focused) continue;

          // Try activating with Enter
          await page.keyboard.press("Enter");
          await new Promise((r) => setTimeout(r, 100));

          if (!(await isStillVisible())) {
            dismissControlsWorked = true;
            break;
          }

          // Try activating with Space
          await page.keyboard.press("Space");
          await new Promise((r) => setTimeout(r, 100));

          if (!(await isStillVisible())) {
            dismissControlsWorked = true;
            break;
          }
        }

        // Step 7 & 8: Genuine trap confirmed if focus stayed contained, Escape failed, and no control exited
        if (
          cycleDetected &&
          modalStillOpenAfterEscape &&
          !dismissControlsWorked
        ) {
          // Take trapped-state screenshot under /evidence/{auditId}/
          const screenshotPath = await saveScreenshot(
            page,
            ctx.auditId,
            "keyboard-trap"
          );

          // Finalize browser recording under /evidence/{auditId}/
          videoRelPath = await finalizeVideo(
            page,
            context,
            ctx.auditId,
            "keyboard-trap"
          );
          contextClosed = true;
          findingReported = true;

          const evidence: KeyboardTrapEvidence = {
            opener: openerSelector,
            tabSequence,
            cycleDetected,
            cycleLength,
            escapePressed,
            modalStillOpenAfterEscape,
            dismissControlsFound,
            dismissControlsWorked,
          };

          // Write raw detection evidence JSON beside screenshot
          await writeEvidenceJson(ctx.auditId, "keyboard-trap", evidence);

          const finding: AuditFinding = {
            title: "Keyboard trap in modal dialog",
            description: `Modal dialog '${dialogSelector}' creates a genuine keyboard trap. Keyboard focus is contained within a loop of ${
              cycleLength ?? "multiple"
            } elements, the Escape key fails to dismiss the dialog, and no focusable control in the dialog can be activated via Enter or Space to dismiss it.`,
            wcagRule: "2.1.2 No Keyboard Trap",
            severity: "critical",
            source: "keyboard-trap",
            checkId: "keyboard-trap",
            fingerprint: makeFingerprint("keyboard-trap", ctx.url, dialogSelector),
            selector: dialogSelector,
            screenshot: screenshotPath,
            recording: videoRelPath,
            evidence,
          };

          return [finding];
        }
      }

      // No keyboard trap found among candidate openers
      return [];
    } finally {
      // Step 9: Always finalize video in finally; delete file if no finding was logged
      if (!contextClosed) {
        try {
          const tempVideoPath = await finalizeVideo(
            page,
            context,
            ctx.auditId,
            "keyboard-trap"
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
    return await withTimeout(execute(), 45000, "keyboard-trap");
  } catch (err) {
    if (err instanceof CheckFailedError) {
      throw err;
    }
    throw new CheckFailedError(
      `Keyboard trap check failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { checkId: "keyboard-trap", cause: err }
    );
  }
}
