import test from "node:test";
import assert from "node:assert/strict";
import { launchBrowser, newAuditContext, navigate } from "../engine/browser";
import { runAxeCheck, deriveWcagRule, getTagsForLevel } from "../engine/checks/axe";
import { CheckFailedError } from "../engine/errors";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";

const PORT = 4096;
const BASE_URL = `http://localhost:${PORT}`;

test("deriveWcagRule converts axe rule tags to standard WCAG rule numbers", () => {
  assert.equal(deriveWcagRule(["cat.color", "wcag2aa", "wcag143"]), "1.4.3");
  assert.equal(deriveWcagRule(["wcag2a", "wcag211"]), "2.1.1");
  assert.equal(deriveWcagRule(["wcag22aa", "wcag2411"]), "2.4.11");
  assert.equal(deriveWcagRule(["cat.keyboard", "wcag2a"]), undefined);
  assert.equal(deriveWcagRule([]), undefined);
});

test("getTagsForLevel maps conformance levels to proper axe tags", () => {
  const tagsA = getTagsForLevel("A");
  assert.ok(tagsA.includes("wcag2a"));
  assert.ok(tagsA.includes("wcag21a"));
  assert.equal(tagsA.includes("wcag2aa"), false);

  const tagsAA = getTagsForLevel("AA");
  assert.ok(tagsAA.includes("wcag2a"));
  assert.ok(tagsAA.includes("wcag2aa"));
  assert.ok(tagsAA.includes("wcag21aa"));
  assert.ok(tagsAA.includes("wcag22aa"));
  assert.equal(tagsAA.includes("wcag2aaa"), false);

  const tagsAAA = getTagsForLevel("AAA");
  assert.ok(tagsAAA.includes("wcag2aaa"));
});

test("runAxeCheck produces 0 findings for /tc2 in both broken and fixed states", async (t) => {
  resetFixtureState();
  const server = startFixtureServer(PORT);
  const browser = await launchBrowser();

  t.after(async () => {
    await browser.close();
    await stopFixtureServer(server);
  });

  const context = await newAuditContext(browser);
  const page = await context.newPage();

  // 1. Broken State (fixed = false)
  await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed: false }),
  });
  await navigate(page, `${BASE_URL}/tc2`);

  const brokenResult = await runAxeCheck(page, {
    url: `${BASE_URL}/tc2`,
    wcagLevel: "AA",
    auditId: "test-axe-broken",
  });

  assert.equal(brokenResult.summary.violationCount, 0);
  assert.equal(brokenResult.findings.length, 0);
  assert.ok(brokenResult.summary.passesCount > 0);

  // 2. Fixed State (fixed = true)
  await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed: true }),
  });
  await navigate(page, `${BASE_URL}/tc2`);

  const fixedResult = await runAxeCheck(page, {
    url: `${BASE_URL}/tc2`,
    wcagLevel: "AA",
    auditId: "test-axe-fixed",
  });

  assert.equal(fixedResult.summary.violationCount, 0);
  assert.equal(fixedResult.findings.length, 0);
  assert.ok(fixedResult.summary.passesCount > 0);

  await context.close();
});

test("runAxeCheck detects violations, formats findings, and derives rules on accessible-deficient content", async (t) => {
  const browser = await launchBrowser();

  t.after(async () => {
    await browser.close();
  });

  const context = await newAuditContext(browser);
  const page = await context.newPage();

  // Load inline HTML with deliberate axe violations (missing image alt: image-alt / WCAG 1.1.1)
  await page.setContent(`
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Test Page with Violations</title></head>
    <body>
      <main>
        <h1>Violation Demo</h1>
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" id="unlabelled-icon" />
      </main>
    </body>
    </html>
  `);

  const result = await runAxeCheck(page, {
    url: "http://example.local/test",
    wcagLevel: "AA",
    auditId: "test-axe-violation",
  });

  assert.ok(result.summary.violationCount > 0);
  assert.ok(result.findings.length > 0);

  const imgFinding = result.findings.find((f) => f.title.toLowerCase().includes("alternate text") || f.description.toLowerCase().includes("alt"));
  assert.ok(imgFinding, "Should identify image-alt violation");
  assert.equal(imgFinding.source, "axe");
  assert.equal(imgFinding.checkId, "axe");
  assert.equal(imgFinding.wcagRule, "1.1.1");
  assert.match(imgFinding.fingerprint, /^[0-9a-f]{16}$/);
  assert.ok(imgFinding.evidence);

  await context.close();
});
