// src/browser/headless-launcher.ts
//
// Headless launcher: loads the bridge page inside a headless Chromium via
// Playwright. This removes the need for a visible browser window, so an AI
// agent can drive Photopea fully unattended.
//
// Playwright is imported dynamically and is an OPTIONAL dependency: the server
// runs fine in system-browser mode without it. It is only required when
// headless mode is requested.

import type { BrowserHandle } from "./types.js";

export interface HeadlessOptions {
  /** Optional Playwright channel ("chrome", "msedge"); default = bundled Chromium. */
  channel?: string;
}

// Flags that keep a headless/background tab fully active. Photopea relies on
// timers and requestAnimationFrame; Chromium throttles those in backgrounded
// tabs, which would stall script execution. These flags disable that throttling.
const KEEP_ALIVE_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

const PLAYWRIGHT_HINT =
  "Headless mode requires Playwright. Install it with:\n" +
  "  npm install playwright\n" +
  "  npx playwright install chromium";

export async function launchHeadlessBrowser(
  url: string,
  opts: HeadlessOptions = {}
): Promise<BrowserHandle> {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(PLAYWRIGHT_HINT);
  }

  const browser = await chromium.launch({
    headless: true,
    channel: opts.channel,
    args: KEEP_ALIVE_ARGS,
  });

  // A reasonably large viewport so Photopea lays out its canvas normally.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // Load the bridge page. We only wait for the document to load — Photopea
  // itself loads asynchronously and the bridge reports readiness over the
  // WebSocket, so there is nothing more to await here.
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });

  return {
    close: async () => {
      await browser.close().catch(() => {
        /* best-effort shutdown */
      });
    },
  };
}
