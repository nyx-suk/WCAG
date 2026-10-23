import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import { createAuditApp } from "../src/api/server";
import { AuditStore } from "../src/persistence/sqlite";
import { runAudit } from "../engine/runAudit";
import { resetFixtureState } from "../fixtures/server";

test("dashboard: accessible, executes audit on TC2, approves finding, and retests lifecycle", async () => {
  resetFixtureState();

  const store = await AuditStore.open(":memory:");
  const app = createAuditApp({ store, runAudit });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Open dashboard
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    // 2. Run axe accessibility check on the dashboard itself
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    if (axeResults.violations.length > 0) {
      console.error("Dashboard axe violations:", JSON.stringify(axeResults.violations, null, 2));
    }
    assert.equal(
      axeResults.violations.length,
      0,
      `Dashboard must have 0 axe violations, found ${axeResults.violations.length}`,
    );

    // 3. Screen 1: Run audit on TC2 (broken fixture on same server)
    await page.fill("#audit-url", `${baseUrl}/tc2`);
    await page.selectOption("#audit-level", "AA");
    await page.click("#btn-run-audit");

    // Wait for audit execution to complete
    await page.waitForSelector("#audit-status-banner.banner-success", { timeout: 15000 });
    const statusText = await page.textContent("#audit-status-text");
    assert.match(statusText || "", /Audit COMPLETE.*1 finding/i);

    // 3b. Verify 4-Step Agent Workflow Timeline (§9.1) is rendered
    await page.waitForSelector("#audit-workflow-container .workflow-step.step-collect");
    const collectText = await page.textContent(".workflow-step.step-collect");
    assert.match(collectText || "", /Step 1 — Collect Audit Details/i);
    assert.match(collectText || "", /Level:\s*AA/i);

    const planText = await page.textContent(".workflow-step.step-plan");
    assert.match(planText || "", /Step 2 — Plan Checks & Rationale/i);
    assert.match(planText || "", /axe/i);
    assert.match(planText || "", /keyboard-operability/i);

    const findText = await page.textContent(".workflow-step.step-find");
    assert.match(findText || "", /Step 3 — Inspect & Find Violations/i);
    assert.match(findText || "", /1 finding/i);
    assert.match(findText || "", /ms\)/i); // asserts duration is rendered

    const actText = await page.textContent(".workflow-step.step-act");
    assert.match(actText || "", /Step 4 — Act/i);
    assert.match(actText || "", /Awaiting Approval/i);

    // 4. Screen 2: Switch to Proposed Findings Review
    await page.click("#tab-proposed");
    await page.waitForSelector(".finding-card", { timeout: 10000 });

    const cardTitle = await page.textContent(".finding-title");
    assert.match(cardTitle || "", /custom control is not keyboard operable/i);

    // Verify screenshot is rendered
    const screenshotImg = await page.$(".evidence-image");
    assert.ok(screenshotImg, "Screenshot image must be visible in proposed finding");
    const imgSrc = await screenshotImg.getAttribute("src");
    assert.match(imgSrc || "", /^\/evidence\//);

    // Verify recording exists
    const recordingVideo = await page.$(".evidence-video");
    assert.ok(recordingVideo, "Recording video element must exist in proposed finding");

    // Click Approve
    const approveBtn = await page.$(".btn-approve");
    assert.ok(approveBtn, "Approve button must exist");
    await approveBtn.click();

    // Card should disappear from proposed list
    await page.waitForSelector(".finding-card", { state: "detached", timeout: 10000 });

    // 5. Screen 3: Verify issue appears in Issues Dashboard
    await page.click("#tab-issues");
    await page.waitForSelector(".data-table tbody tr", { timeout: 10000 });

    const tableText = await page.textContent(".data-table tbody tr");
    assert.match(tableText || "", /Custom control is not keyboard operable/i);
    assert.match(tableText || "", /approved_logged/i);

    // Click View & Retest
    await page.click(".btn-view-detail");

    // 6. Screen 4: Issue Detail & Retest
    await page.waitForSelector("#panel-issue-detail.active", { timeout: 5000 });
    await page.waitForSelector("#btn-retest-now", { timeout: 5000 });

    // Status is approved_logged
    const detailStatus = await page.textContent("#issue-detail-content .badge-status");
    assert.match(detailStatus || "", /approved_logged/i);

    // STEP A: Retest while fixture is STILL BROKEN
    await page.click("#btn-retest-now");
    await page.waitForSelector(".comparison-column.after-fail", { timeout: 15000 });
    const failComparison = await page.textContent(".comparison-column.after-fail");
    assert.match(failComparison || "", /FAIL \(Issue Stays Open\)/i);

    // Confirm issue status remains approved_logged
    const intermediateStatus = await page.textContent("#issue-detail-content .badge-status");
    assert.match(intermediateStatus || "", /approved_logged/i);

    // STEP B: Fix the fixture state via API
    const toggleRes = await fetch(`${baseUrl}/__state/tc2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixed: true }),
    });
    assert.equal(toggleRes.status, 200);

    // STEP C: Retest again now that the page is fixed
    await page.click("#btn-retest-now");
    await page.waitForSelector(".comparison-column.after-pass", { timeout: 15000 });
    const passComparison = await page.textContent(".comparison-column.after-pass");
    assert.match(passComparison || "", /PASS \(Issue Resolved\)/i);

    // Confirm issue status transitioned to resolved
    await page.waitForSelector("#issue-detail-content .status-resolved", { timeout: 10000 });
    const resolvedStatus = await page.textContent("#issue-detail-content .status-resolved");
    assert.match(resolvedStatus || "", /resolved/i);

    // 7. Screen 5: Verify Official Test Runs tab loads
    await page.click("#tab-test-runs");
    await page.waitForSelector("#test-runs-container table", { timeout: 10000 });
    const testRunsText = await page.textContent("#test-runs-container table");
    assert.match(testRunsText || "", /TC1/i);
    assert.match(testRunsText || "", /TC4/i);
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    store.close();
    resetFixtureState();
  }
});
