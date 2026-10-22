import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, EVIDENCE_DIR, newAuditContext, navigate } from "../engine/browser";
import { describeFinding } from "../engine/evidence";
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

    const brokenAuditId = `dev-tc2-broken-${Date.now()}`;
    // Run keyboard operability check on broken page
    const brokenFindings = await runKeyboardOperabilityCheck({
      url: `${BASE_URL}/tc2`,
      auditId: brokenAuditId,
      browser,
    });

    console.log(`Broken page keyboard findings count: ${brokenFindings.length}`);
    const foundAddToCart = brokenFindings.some((f) => f.selector === "#add-to-cart");
    let filesVerified = false;

    if (brokenFindings.length > 0) {
      for (const f of brokenFindings) {
        console.log(`- Title:       ${f.title}`);
        console.log(`- Rule:        ${f.wcagRule}`);
        console.log(`- Severity:    ${f.severity}`);
        console.log(`- Selector:    ${f.selector}`);
        console.log(`- Screenshot:  ${f.screenshot}`);
        console.log(`- Recording:   ${f.recording}`);

        console.log("\n--- Jargon-Free Finding Description ---");
        console.log(describeFinding(f));
        console.log("---------------------------------------\n");

        // Verify screenshot file exists under /evidence/{auditId}/
        if (f.screenshot) {
          const fullScreenPath = path.join(EVIDENCE_DIR, f.screenshot);
          const screenStat = await fs.stat(fullScreenPath);
          console.log(`  * Screenshot verified: ${f.screenshot} (${screenStat.size} bytes)`);
        }

        // Verify recording file exists under /evidence/{auditId}/
        if (f.recording) {
          const fullRecPath = path.join(EVIDENCE_DIR, f.recording);
          const recStat = await fs.stat(fullRecPath);
          console.log(`  * Recording verified:  ${f.recording} (${recStat.size} bytes)`);
        }

        // Verify raw JSON evidence file exists under /evidence/{auditId}/
        const jsonEvidencePath = path.join(EVIDENCE_DIR, brokenAuditId, "operability-0.json");
        const jsonStat = await fs.stat(jsonEvidencePath);
        console.log(`  * Evidence JSON verified: ${brokenAuditId}/operability-0.json (${jsonStat.size} bytes)`);

        const screenshotInDir = f.screenshot?.startsWith(`${brokenAuditId}/`);
        const recordingInDir = f.recording?.startsWith(`${brokenAuditId}/`);
        filesVerified = Boolean(screenshotInDir && recordingInDir);
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

    const brokenPassed = foundAddToCart && brokenFindings.length === 1 && filesVerified;
    const fixedPassed = fixedFindings.length === 0;
    const axeClean = axeResult.summary.violationCount === 0;

    if (brokenPassed && fixedPassed && axeClean) {
      console.log(
        "SUCCESS: Broken found #add-to-cart with evidence under /evidence/{auditId}/, fixed found none, and axe reported zero violations."
      );
      process.exit(0);
    } else {
      console.error(
        `FAILURE: Criteria not met (brokenFound: ${foundAddToCart}, filesVerified: ${filesVerified}, fixedCount: ${fixedFindings.length}, axeClean: ${axeClean})`
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
