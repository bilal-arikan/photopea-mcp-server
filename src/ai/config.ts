// src/ai/config.ts
import type { AiKeys } from "./types.js";

/**
 * Resolve third-party AI API keys from the environment.
 *
 *   Dezgo (Remove BG + generative inpainting):
 *     PHOTOPEA_MCP_DEZGO_KEY  (preferred)  or  DEZGO_API_KEY
 *   remove.bg (background removal):
 *     PHOTOPEA_MCP_REMOVEBG_KEY  (preferred)  or  REMOVEBG_API_KEY
 */
export function resolveAiKeys(env: NodeJS.ProcessEnv = process.env): AiKeys {
  const pick = (...names: string[]): string | undefined => {
    for (const n of names) {
      const v = env[n]?.trim();
      if (v) return v;
    }
    return undefined;
  };
  return {
    dezgo: pick("PHOTOPEA_MCP_DEZGO_KEY", "DEZGO_API_KEY"),
    removebg: pick("PHOTOPEA_MCP_REMOVEBG_KEY", "REMOVEBG_API_KEY"),
  };
}
