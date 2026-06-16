// src/ai/config.ts
import type { AiKeys } from "./types.js";

/**
 * Resolve the Dezgo API key from the environment (Remove BG + generative
 * inpainting):
 *
 *   PHOTOPEA_MCP_DEZGO_KEY  (preferred)  or  DEZGO_API_KEY
 */
export function resolveAiKeys(env: NodeJS.ProcessEnv = process.env): AiKeys {
  const dezgo = env.PHOTOPEA_MCP_DEZGO_KEY?.trim() || env.DEZGO_API_KEY?.trim() || undefined;
  return { dezgo };
}
