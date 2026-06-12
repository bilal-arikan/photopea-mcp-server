// src/browser/launcher.ts
//
// Resolves the configured launch strategy into a single BrowserLauncher the
// bridge can call. Keeps the headless vs. system decision in one place.

import type { LaunchConfig } from "../config.js";
import { launchSystemBrowser } from "./system-launcher.js";
import { launchHeadlessBrowser } from "./headless-launcher.js";
import type { BrowserHandle, BrowserLauncher } from "./types.js";

/** Open the bridge page using the strategy selected by `config`. */
export async function launchBridgeBrowser(
  url: string,
  config: LaunchConfig
): Promise<BrowserHandle> {
  if (config.headless) {
    return launchHeadlessBrowser(url, { channel: config.browserChannel });
  }
  return launchSystemBrowser(url);
}

/** Bind a LaunchConfig into a zero-config BrowserLauncher closure. */
export function createBrowserLauncher(config: LaunchConfig): BrowserLauncher {
  return (url: string) => launchBridgeBrowser(url, config);
}
