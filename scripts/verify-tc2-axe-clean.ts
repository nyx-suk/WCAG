import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import http from "node:http";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

const PORT = Number(process.env.FIXTURE_PORT) || 4000;
const BASE_URL = `http://localhost:${PORT}`;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function setTc2State(fixed: boolean): Promise<void> {
  const res = await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed }),
  });
  if (!res.ok) {
    throw new Error(`Failed to set TC2 state (status ${res.status})`);
  }
}

async function resetState(): Promise<void> {
  await fetch(`${BASE_URL}/__state/reset`, { method: "POST" });
}

async function run(): Promise<void> {
  let server: http.Server | null = null;
  let browser: Browser | null = null;

  try {
    const alreadyRunning = await isServerRunning(BASE_URL);
    if (!alreadyRunning) {
      console.log(`[verify-tc2] Starting fixture server on port ${PORT}...`);
      server = startFixtureServer(PORT);
      // Wait for server to accept connections
      for (let i = 0; i < 20; i++) {
        if (await isServerRunning(BASE_URL)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    } else {
      console.log(`[verify-tc2] Reusing running fixture server at ${BASE_URL}...`);
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    console.log(`\n==================================================`);
    console.log(`Verifying TC2 Axe-Core Compliance (${AXE_TAGS.join(", ")})`);
    console.log(`==================================================\n`);

    // 1. Test Broken State (fixed: false)
    await setTc2State(false);
    await page.goto(`${BASE_URL}/tc2`, { waitUntil: "networkidle" });

    // Verify it is serving the broken page
    const brokenIsDiv = await page.evaluate(() => {
      const el = document.getElementById("add-to-cart");
      return el?.tagName.toLowerCase() === "div";
    });
    if (!brokenIsDiv) {
      throw new Error("Expected #add-to-cart to be a <div> in broken state");
    }

    const brokenResults = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .analyze();

    console.log(`State: BROKEN (fixed=false)`);
    console.log(`URL:   ${BASE_URL}/tc2`);
    console.log(`Element: <div id="add-to-cart" class="btn btn-primary">`);
    console.log(`Axe-core Violations: ${brokenResults.violations.length}`);

    if (brokenResults.violations.length > 0) {
      console.error("\n[!] Violations found in BROKEN state:");
      for (const v of brokenResults.violations) {
        console.error(` - [${v.id}] ${v.help} (${v.impact})`);
        for (const n of v.nodes) {
          console.error(`   Target: ${n.target.join(", ")}`);
        }
      }
    }

    console.log("--------------------------------------------------");

    // 2. Test Fixed State (fixed: true)
    await setTc2State(true);
    await page.goto(`${BASE_URL}/tc2`, { waitUntil: "networkidle" });

    // Verify it is serving the fixed page
    const fixedIsButton = await page.evaluate(() => {
      const el = document.getElementById("add-to-cart");
      return el?.tagName.toLowerCase() === "button";
    });
    if (!fixedIsButton) {
      throw new Error("Expected #add-to-cart to be a <button> in fixed state");
    }

    const fixedResults = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .analyze();

    console.log(`State: FIXED (fixed=true)`);
    console.log(`URL:   ${BASE_URL}/tc2`);
    console.log(`Element: <button id="add-to-cart" class="btn btn-primary">`);
    console.log(`Axe-core Violations: ${fixedResults.violations.length}`);

    if (fixedResults.violations.length > 0) {
      console.error("\n[!] Violations found in FIXED state:");
      for (const v of fixedResults.violations) {
        console.error(` - [${v.id}] ${v.help} (${v.impact})`);
        for (const n of v.nodes) {
          console.error(`   Target: ${n.target.join(", ")}`);
        }
      }
    }

    console.log(`\n==================================================`);

    // Reset back to broken
    await resetState();

    const brokenCount = brokenResults.violations.length;
    const fixedCount = fixedResults.violations.length;

    if (brokenCount === 0 && fixedCount === 0) {
      console.log(`\nSUCCESS: Both TC2 states produced 0 axe violations!`);
      process.exit(0);
    } else {
      console.error(`\nFAILURE: Violations detected (Broken: ${brokenCount}, Fixed: ${fixedCount})`);
      process.exit(1);
    }
  } catch (err) {
    console.error("Error executing verify-tc2-axe-clean:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (server) await stopFixtureServer(server);
  }
}

run();
