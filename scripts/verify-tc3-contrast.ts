import http from "node:http";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  EVIDENCE_DIR,
  launchBrowser,
  navigate,
  newAuditContext,
  saveScreenshot,
} from "../engine/browser";
import { sampleContrast } from "../engine/contrast-sampler";
import { startFixtureServer, stopFixtureServer } from "../fixtures/server";

const PORT = Number(process.env.FIXTURE_PORT) || 4000;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_NAME = "tc3-contrast-verification.png";

async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  let server: http.Server | null = null;
  let browser: Browser | null = null;
  let context: Awaited<ReturnType<typeof newAuditContext>> | null = null;

  try {
    if (!(await isServerRunning())) {
      server = startFixtureServer(PORT);
      for (let attempt = 0; attempt < 20 && !(await isServerRunning()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    browser = await launchBrowser();
    context = await newAuditContext(browser);
    const page = await context.newPage();
    await navigate(page, `${BASE_URL}/tc3`, { checkId: "contrast" });
    await page.locator("main.hero img").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const image = document.querySelector("main.hero img");
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });

    const caption = page.locator("#hero-caption");
    const boundingBox = await caption.boundingBox();
    const text = await caption.textContent();
    if (!boundingBox || text === null) {
      throw new Error("Could not determine #hero-caption text or bounding box");
    }

    const screenshotPath = await saveScreenshot(page, SCREENSHOT_NAME, { fullPage: false });
    const result = await sampleContrast({
      checkId: "tc3-contrast",
      pageUrl: `${BASE_URL}/tc3`,
      screenshot: {
        kind: "path",
        path: path.join(EVIDENCE_DIR, screenshotPath),
        mimeType: "image/png",
      },
      target: { selector: "#hero-caption", text, boundingBox },
      wcagCriterion: "1.4.3",
      requiredRatio: 4.5,
    });

    console.log(`Text: ${text}`);
    console.log(`Contrast ratio: ${result.evidence.measuredRatio?.toFixed(2) ?? "incomplete"}`);
    console.log(`Threshold: ${result.evidence.requiredRatio}:1`);
    console.log(`Result: ${result.status.toUpperCase()}`);
    console.log(`Screenshot: ${path.join(EVIDENCE_DIR, screenshotPath)}`);

    if (result.status === "incomplete") {
      throw new Error(`TC3 contrast sampling incomplete: ${result.summary}`);
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await stopFixtureServer(server);
  }
}

run().catch((error: unknown) => {
  console.error("TC3 verification failed:", error);
  process.exitCode = 1;
});
