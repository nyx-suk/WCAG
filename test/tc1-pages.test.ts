import test from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

const TEST_PORT = 4098;
const BASE_URL = `http://localhost:${TEST_PORT}`;

test("TC1 bad modal genuinely traps keyboard users", async (t) => {
  const server = startFixtureServer(TEST_PORT);
  let browser: Browser | null = null;

  t.after(async () => {
    if (browser) await browser.close();
    await stopFixtureServer(server);
  });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(`${BASE_URL}/tc1/bad`);

  // 1. Open modal via keyboard (focus opener, press Enter)
  await page.focus("#open-newsletter-btn");
  await page.keyboard.press("Enter");

  // Modal becomes visible
  const backdrop = page.locator("#newsletter-backdrop");
  await assert.doesNotReject(backdrop.waitFor({ state: "visible" }));

  // Email input is focused
  let activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "newsletter-email");

  // 2. Tab cycling (focus containment inside modal)
  await page.keyboard.press("Tab");
  activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "maybe-later-btn");

  await page.keyboard.press("Tab");
  activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "subscribe-btn");

  // Cycling back to first focusable element
  await page.keyboard.press("Tab");
  activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "newsletter-email");

  // 3. Escape key does NOT dismiss the bad modal (trap behavior)
  await page.keyboard.press("Escape");
  let isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, false, "Escape must not dismiss the bad modal");

  // 4. Keyboard activation of "Maybe later" (Enter or Space) does NOT dismiss it
  await page.keyboard.press("Tab"); // on maybe-later-btn
  await page.keyboard.press("Enter");
  isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, false, "Keyboard activation of 'Maybe later' must not dismiss the bad modal");

  // 5. Mouse click (mousedown) on backdrop closes it (mouse users can exit)
  await page.mouse.click(10, 10);
  isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, true, "Mouse user can dismiss via backdrop click");
});

test("TC1 good modal is accessible and Escape closes it with focus restoration", async (t) => {
  const server = startFixtureServer(TEST_PORT + 1);
  let browser: Browser | null = null;

  t.after(async () => {
    if (browser) await browser.close();
    await stopFixtureServer(server);
  });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(`http://localhost:${TEST_PORT + 1}/tc1/good`);

  // 1. Open modal via keyboard Enter
  await page.focus("#open-newsletter-btn");
  await page.keyboard.press("Enter");

  let isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, false);

  // Focus moves into modal
  let activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "newsletter-email");

  // 2. Escape closes the modal and restores focus to opener
  await page.keyboard.press("Escape");
  isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, true, "Escape must dismiss the good modal");

  activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "open-newsletter-btn", "Focus must be restored to opener");

  // 3. Open modal again, dismiss via keyboard Enter on "Maybe later"
  await page.keyboard.press("Enter"); // opener was focused
  isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, false);

  await page.keyboard.press("Tab"); // moves to maybe-later-btn
  activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "maybe-later-btn");

  await page.keyboard.press("Enter");
  isHidden = await page.evaluate(() =>
    document.getElementById("newsletter-backdrop")?.classList.contains("hidden")
  );
  assert.equal(isHidden, true, "Keyboard activation of 'Maybe later' must dismiss the good modal");

  activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, "open-newsletter-btn", "Focus must be restored to opener");
});
