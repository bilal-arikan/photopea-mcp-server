// src/ai/index.ts
// High-level orchestration for the AI image features. Network calls live here;
// request shaping is delegated to providers.ts (pure, unit-tested).

import type { AiKeys, BgRemovalProvider } from "./types.js";
import {
  buildInpaintRequest,
  buildRemoveBackgroundRequest,
  missingKeyMessage,
  selectBgProvider,
  sendImageRequest,
  type InpaintOptions,
} from "./providers.js";

/** Remove the background of a PNG. Returns a PNG cutout with transparency. */
export async function removeBackground(
  image: Buffer,
  providerChoice: BgRemovalProvider | "auto",
  keys: AiKeys
): Promise<Buffer> {
  const { provider, key } = selectBgProvider(providerChoice, keys);
  const req = buildRemoveBackgroundRequest(provider, image, key);
  return sendImageRequest(req);
}

/** Generative inpaint: fill the white-masked region of `image` from `prompt`. */
export async function generativeInpaint(
  image: Buffer,
  mask: Buffer,
  prompt: string,
  keys: AiKeys,
  opts: InpaintOptions = {}
): Promise<Buffer> {
  if (!keys.dezgo) throw new Error(missingKeyMessage("dezgo"));
  const req = buildInpaintRequest("dezgo", image, mask, prompt, keys.dezgo, opts);
  return sendImageRequest(req);
}

export type { AiKeys, BgRemovalProvider };
