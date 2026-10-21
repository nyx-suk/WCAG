import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, EVIDENCE_DIR, newAuditContext, navigate } from "../engine/browser";
import { runKeyboardOperabilityCheck } from "../engine/checks/keyboardOperability";
import { runAxeCheck } from "../engine/checks/axe";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

const PORT = Number(process.env.FIXTURE_PORT) || 4000;
const BASE_URL = `http://localhost:${PORT}`;

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function setTc2State(fixed: boolean): Promise<void> {
  await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed }),
  });
}

async function main(): Promise<void> {
  let server: http.Server | null = null;
  let browser = null;

  try {
    const running = await isServerRunning(BASE_URL);
    if (!running) {
      console.log(`[dev-keyboard-operability] Starting fixture server on port ${PORT}...`);
      server = startFixtureServer(PORT);
      for (let i = 0; i < 20; i++) {
        if (await isServerRunning(BASE_URL)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    browser = await launchBrowser();

    console.log("\n==================================================");
    console.log("1. Testing TC2 Broken: Custom Non-Interactive Div Button");
    console.log("==================================================");

    await setTc2State(false);

    // Verify axe-core reports 0 violations on broken
    const axeContext = await newAuditContext(browser);
    const axePage = await axeContext.newPage();
    await navigate(axePage, `${BASE_URL}/tc2`, { checkId: "axe" });
    const axeResult = await runAxeCheck(axePage, {
      url: `${BASE_URL}/tc2`,
      wcagLevel: "AA",
      auditId: "axe-broken-verify",
    });
    await axeContext.close();

    console.log(`Axe-core scan on broken page: ${axeResult.summary.violationCount} violations.`);
    if (axeResult.summary.violationCount !== 0) {
      console.error("FAIL: Expected 0 axe violations on broken TC2 page!");
      process.exit(1);
    }

    // Run keyboard operability check on broken page
    const brokenFindings = await runKeyboardOperabilityCheck({
      url: `${BASE_URL}/tc2`,
      auditId: `dev-tc2-broken-${Date.now()}`,
      browser,
    });

    console.log(`Broken page keyboard findings count: ${brokenFindings.length}`);
    const foundAddToCart = brokenFindings.some((f) => f.selector === "#add-to-cart");

    if (brokenFindings.length > 0) {
      for (const f of brokenFindings) {
        console.log(`- Title:       ${f.title}`);
        console.log(`- Rule:        ${f.wcagRule}`);
        console.log(`- Severity:    ${f.severity}`);
        console.log(`- Selector:    ${f.selector}`);
        console.log(`- Screenshot:  ${f.screenshot}`);
        console.log(`- Recording:   ${f.recording}`);

        const ev = f.evidence as any;
        console.log(`- Evidence:`);
        console.log(`  * Cursor pointer:    ${ev.cursorPointer}`);
        console.log(`  * Has click handler: ${ev.hasClickHandler}`);
        console.log(`  * Reachable by Tab:  ${ev.reachableByTab}`);
        console.log(`  * Tabs pressed:      ${ev.tabsPressed}`);
        console.log(`  * Enter activated:   ${ev.enterActivated}`);
        console.log(`  * Space activated:   ${ev.spaceActivated}`);

        if (f.recording) {
          const recStat = await fs.stat(path.join(EVIDENCE_DIR, f.recording));
          console.log(`  * Recording verified (${recStat.size} bytes)`);
        }
      }
    }

    console.log("\n==================================================");
    console.log("2. Testing TC2 Fixed: Native Semantic Button");
    console.log("==================================================");

    await setTc2State(true);

    const fixedFindings = await runKeyboardOperabilityCheck({
      url: `${BASE_URL}/tc2`,
      auditId: `dev-tc2-fixed-${Date.now()}`,
      browser,
    });

    console.log(`Fixed page keyboard findings count: ${fixedFindings.length}`);
    if (fixedFindings.length === 0) {
      console.log("✓ No inoperable custom controls detected on fixed page.");
    }

    console.log("\n==================================================");

    // Reset TC2 state
    await setTc2State(false);

    const brokenPassed = foundAddToCart && brokenFindings.length === 1;
    const fixedPassed = fixedFindings.length === 0;
    const axeClean = axeResult.summary.violationCount === 0;

    if (brokenPassed && fixedPassed && axeClean) {
      console.log(
        "SUCCESS: Broken found #add-to-cart, fixed found none, and axe reported zero violations."
      );
      process.exit(0);
    } else {
      console.error(
        `FAILURE: Criteria not met (brokenFound: ${foundAddToCart}, fixedCount: ${fixedFindings.length}, axeClean: ${axeClean})`
      );
      process.exit(1);
    }
  } catch (err) {
    console.error("[dev-keyboard-operability] Error:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (server) await stopFixtureServer(server);
  }
}

main();
