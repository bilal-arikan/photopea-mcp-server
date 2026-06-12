// src/browser/types.ts
//
// Abstraction over "something that opens the bridge page in a browser".
// Both the system-browser launcher and the headless Playwright launcher
// implement this contract, so the bridge stays agnostic of which one is used.

/** A handle to a launched browser, allowing graceful shutdown. */
export interface BrowserHandle {
  /**
   * Close the browser if this launcher owns it. For the system-browser
   * launcher (an external window we cannot control) this is a no-op.
   */
  close(): Promise<void>;
}

/** Opens `url` in a browser and resolves once the browser has been launched. */
export type BrowserLauncher = (url: string) => Promise<BrowserHandle>;

/** A no-op handle for launchers that do not own the browser process. */
export const NOOP_BROWSER_HANDLE: BrowserHandle = {
  close: async () => {},
};
