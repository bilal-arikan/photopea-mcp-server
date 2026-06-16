// src/ai/index.ts
// High-level orchestration for the Dezgo AI image features. Network calls live
// here; request shaping is delegated to providers.ts (pure, unit-tested).

import type { AiKeys } from "./types.js";
import {
  buildInpaintRequest,
  buildRemoveBackgroundRequest,
  MISSING_DEZGO_KEY,
  sendImageRequest,
  type InpaintOptions,
} from "./providers.js";

/** Remove the background of a PNG via Dezgo. Returns a transparent PNG cutout. */
export async function removeBackground(image: Buffer, keys: AiKeys): Promise<Buffer> {
  if (!keys.dezgo) throw new Error(MISSING_DEZGO_KEY);
  return sendImageRequest(buildRemoveBackgroundRequest(image, keys.dezgo));
}

/** Generative inpaint via Dezgo: fill the white-masked region from `prompt`. */
export async function generativeInpaint(
  image: Buffer,
  mask: Buffer,
  prompt: string,
  keys: AiKeys,
  opts: InpaintOptions = {}
): Promise<Buffer> {
  if (!keys.dezgo) throw new Error(MISSING_DEZGO_KEY);
  return sendImageRequest(buildInpaintRequest(image, mask, prompt, keys.dezgo, opts));
}

export type { AiKeys };
