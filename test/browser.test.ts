import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  launchBrowser,
  newAuditContext,
  navigate,
  finalizeVideo,
  saveScreenshot,
  withTimeout,
  EVIDENCE_DIR,
} from "../engine/browser";
import { NavigationError, CheckTimeoutError } from "../engine/errors";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

const PORT = 4097;
const BASE_URL = `http://localhost:${PORT}`;

test("browser harness: recording, screenshots, navigation, and timeouts", async (t) => {
  const server = startFixtureServer(PORT);
  const browser = await launchBrowser();

  t.after(async () => {
    await browser.close();
    await stopFixtureServer(server);
  });

  // 1. Test video recording on /tc1/bad
  const auditId = `test-audit-${Date.now()}`;
  const checkId = "keyboard-trap";

  const context = await newAuditContext(browser, { record: {} });
  const page = await context.newPage();

  // Test navigate() with successful page load
  await navigate(page, `${BASE_URL}/tc1/bad`);

  // Open modal and press Tab three times
  await page.focus("#open-newsletter-btn");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#newsletter-email:focus");

  await page.keyboard.press("Tab"); // moves to maybe-later-btn
  await page.keyboard.press("Tab"); // moves to subscribe-btn
  await page.keyboard.press("Tab"); // cycles back to newsletter-email

  // Test saveScreenshot()
  const screenshotRelPath = await saveScreenshot(page, auditId, "screen");
  assert.equal(screenshotRelPath, path.join(auditId, "screen.png"));
  const screenshotFullPath = path.join(EVIDENCE_DIR, screenshotRelPath);
  const screenshotStat = await fs.stat(screenshotFullPath);
  assert.ok(screenshotStat.size > 0, "Screenshot should not be empty");

  // Test finalizeVideo()
  const videoRelPath = await finalizeVideo(page, context, auditId, checkId);
  assert.equal(videoRelPath, path.join(auditId, `${checkId}.webm`));

  const videoFullPath = path.join(EVIDENCE_DIR, videoRelPath);
  const videoStat = await fs.stat(videoFullPath);
  assert.ok(videoStat.size > 0, "Recorded webm file should exist and have size > 0");

  // 2. Test navigate() error handling on 404
  const errorContext = await newAuditContext(browser);
  const errorPage = await errorContext.newPage();

  await assert.rejects(
    async () => {
      await navigate(errorPage, `${BASE_URL}/nonexistent-page-404`, { checkId: "axe" });
    },
    (err: unknown) => {
      assert.ok(err instanceof NavigationError);
      assert.equal((err as NavigationError).checkId, "axe");
      assert.match((err as Error).message, /failed with HTTP status 404/);
      return true;
    }
  );

  await errorContext.close();

  // 3. Test withTimeout()
  const checkIdTimeout = "keyboard-operability";
  await assert.rejects(
    async () => {
      await withTimeout(
        new Promise((resolve) => setTimeout(resolve, 500)),
        50,
        checkIdTimeout
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof CheckTimeoutError);
      assert.equal((err as CheckTimeoutError).checkId, checkIdTimeout);
      assert.match((err as Error).message, /timed out after 50ms/);
      return true;
    }
  );
});
