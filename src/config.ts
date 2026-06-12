// src/config.ts
//
// Runtime launch configuration, resolved from CLI flags and environment
// variables. Controls how the Photopea bridge page is opened (a visible
// system browser window vs. a headless Chromium instance).

export interface LaunchConfig {
  /** When true, the bridge page is loaded in a headless Chromium (Playwright). */
  headless: boolean;
  /**
   * Optional Playwright browser channel (e.g. "chrome", "msedge"). When unset,
   * Playwright's bundled Chromium is used. Only relevant in headless mode.
   */
  browserChannel?: string;
}

/**
 * Resolve the launch configuration.
 *
 * Headless mode is enabled by any of:
 *   - CLI flag:  --headless
 *   - env:       PHOTOPEA_MCP_HEADLESS=1 | true
 *
 * Optional browser channel:
 *   - env:       PHOTOPEA_MCP_BROWSER_CHANNEL=chrome
 */
export function resolveLaunchConfig(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): LaunchConfig {
  const headlessEnv = (env.PHOTOPEA_MCP_HEADLESS ?? "").toLowerCase();
  const headless =
    argv.includes("--headless") ||
    headlessEnv === "1" ||
    headlessEnv === "true";

  const channel = env.PHOTOPEA_MCP_BROWSER_CHANNEL?.trim();

  return {
    headless,
    browserChannel: channel ? channel : undefined,
  };
}
