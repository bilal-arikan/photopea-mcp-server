// src/browser/system-launcher.ts
//
// Default launcher: opens the bridge page in the user's default system browser
// (a real, visible window). We do not own that process, so close() is a no-op.

import { launchBrowser } from "../utils/platform.js";
import { NOOP_BROWSER_HANDLE, type BrowserHandle } from "./types.js";

export async function launchSystemBrowser(url: string): Promise<BrowserHandle> {
  await launchBrowser(url);
  return NOOP_BROWSER_HANDLE;
}
