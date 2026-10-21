import http from "node:http";
import { launchBrowser, newAuditContext, navigate } from "../engine/browser";
import { runAxeCheck } from "../engine/checks/axe";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "http://localhost:4000/tc2";
  const wcagLevel = (process.argv[3] as "A" | "AA" | "AAA") ?? "AA";
  const auditId = `dev-axe-${Date.now()}`;

  let server: http.Server | null = null;
  let browser = null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.port === "4000" || parsedUrl.hostname === "localhost") {
      const running = await isServerRunning(`${parsedUrl.protocol}//${parsedUrl.host}`);
      if (!running) {
        console.log(`[dev-axe] Auto-starting fixture server on port ${parsedUrl.port || 4000}...`);
        server = startFixtureServer(Number(parsedUrl.port) || 4000);
        for (let i = 0; i < 20; i++) {
          if (await isServerRunning(`${parsedUrl.protocol}//${parsedUrl.host}`)) break;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }

    console.log(`[dev-axe] Auditing: ${url} (WCAG Level: ${wcagLevel})`);
    browser = await launchBrowser();
    const context = await newAuditContext(browser);
    const page = await context.newPage();

    await navigate(page, url, { checkId: "axe" });

    const result = await runAxeCheck(page, {
      url,
      wcagLevel,
      auditId,
    });

    console.log("\n================ AXE AUDIT SUMMARY ================");
    console.log(`URL:              ${url}`);
    console.log(`WCAG Level:       ${wcagLevel}`);
    console.log(`Violations:       ${result.summary.violationCount}`);
    console.log(`Passes:           ${result.summary.passesCount}`);
    console.log(`Incomplete:       ${result.summary.incompleteCount}`);
    console.log(`Findings count:   ${result.findings.length}`);
    console.log("====================================================\n");

    if (result.findings.length > 0) {
      console.log("Findings:");
      for (const finding of result.findings) {
        console.log(`\n- [${finding.severity.toUpperCase()}] ${finding.title}`);
        console.log(`  Rule:        ${finding.wcagRule}`);
        console.log(`  Fingerprint: ${finding.fingerprint}`);
        console.log(`  Selector:    ${finding.selector ?? "N/A"}`);
        console.log(`  Description: ${finding.description}`);
      }
    } else {
      console.log("✓ No accessibility violations detected by axe-core.");
    }

    await context.close();
  } catch (err) {
    console.error("[dev-axe] Error running axe check:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (server) await stopFixtureServer(server);
  }
}

main();
