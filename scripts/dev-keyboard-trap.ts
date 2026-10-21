import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, EVIDENCE_DIR } from "../engine/browser";
import { runKeyboardTrapCheck } from "../engine/checks/keyboardTrap";
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

async function main(): Promise<void> {
  let server: http.Server | null = null;
  let browser = null;

  try {
    const running = await isServerRunning(BASE_URL);
    if (!running) {
      console.log(`[dev-keyboard-trap] Starting fixture server on port ${PORT}...`);
      server = startFixtureServer(PORT);
      for (let i = 0; i < 20; i++) {
        if (await isServerRunning(BASE_URL)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    browser = await launchBrowser();

    console.log("\n==================================================");
    console.log("Testing TC1 Bad: Inescapable Modal Trap");
    console.log("==================================================");

    const badFindings = await runKeyboardTrapCheck({
      url: `${BASE_URL}/tc1/bad`,
      auditId: `dev-tc1-bad-${Date.now()}`,
      browser,
    });

    console.log(`Bad page findings count: ${badFindings.length}`);
    if (badFindings.length > 0) {
      const f = badFindings[0];
      console.log(`- Title:       ${f.title}`);
      console.log(`- Rule:        ${f.wcagRule}`);
      console.log(`- Severity:    ${f.severity}`);
      console.log(`- Fingerprint: ${f.fingerprint}`);
      console.log(`- Selector:    ${f.selector}`);
      console.log(`- Screenshot:  ${f.screenshot}`);
      console.log(`- Recording:   ${f.recording}`);

      const ev = f.evidence as any;
      console.log(`- Evidence:`);
      console.log(`  * Cycle detected: ${ev.cycleDetected} (length: ${ev.cycleLength})`);
      console.log(`  * Escape pressed: ${ev.escapePressed}`);
      console.log(`  * Still open after escape: ${ev.modalStillOpenAfterEscape}`);
      console.log(`  * Controls tried: ${JSON.stringify(ev.dismissControlsFound)}`);
      console.log(`  * Controls worked: ${ev.dismissControlsWorked}`);
      console.log(`  * Tab sequence sample (first 4):`, ev.tabSequence?.slice(0, 4));

      // Verify recording exists and is non-empty
      if (f.recording) {
        const fullRecPath = path.join(EVIDENCE_DIR, f.recording);
        const stat = await fs.stat(fullRecPath);
        console.log(`  * Recording verified: ${fullRecPath} (${stat.size} bytes)`);
      }
    }

    console.log("\n==================================================");
    console.log("Testing TC1 Good: Accessible Modal");
    console.log("==================================================");

    const goodFindings = await runKeyboardTrapCheck({
      url: `${BASE_URL}/tc1/good`,
      auditId: `dev-tc1-good-${Date.now()}`,
      browser,
    });

    console.log(`Good page findings count: ${goodFindings.length}`);
    if (goodFindings.length === 0) {
      console.log("✓ No keyboard trap detected (modal escaped properly).");
    } else {
      console.error("! Unexpected findings on good page:", goodFindings);
    }

    console.log("\n==================================================");

    const badPassed =
      badFindings.length === 1 &&
      badFindings[0].severity === "critical" &&
      badFindings[0].wcagRule === "2.1.2 No Keyboard Trap" &&
      Boolean(badFindings[0].recording);

    const goodPassed = goodFindings.length === 0;

    if (badPassed && goodPassed) {
      console.log("SUCCESS: TC1 Bad produced 1 critical trap finding; TC1 Good produced 0 findings.");
      process.exit(0);
    } else {
      console.error(
        `FAILURE: TC1 results mismatch (Bad findings: ${badFindings.length}, Good findings: ${goodFindings.length})`
      );
      process.exit(1);
    }
  } catch (err) {
    console.error("[dev-keyboard-trap] Error:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (server) await stopFixtureServer(server);
  }
}

main();
