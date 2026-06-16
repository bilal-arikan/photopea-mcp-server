// src/ai/providers.ts
// Pure request builders + a thin fetch executor for the AI image providers.
// The builders return plain ImageHttpRequest descriptors so they can be
// unit-tested without any network access.

import type {
  AiKeys,
  BgRemovalProvider,
  ImageHttpRequest,
  InpaintProvider,
} from "./types.js";

const DEZGO_BASE = "https://api.dezgo.com";
const REMOVEBG_URL = "https://api.remove.bg/v1.0/removebg";

export interface InpaintOptions {
  /** Optional negative prompt (things to avoid). */
  negativePrompt?: string;
  /** Optional fixed seed for reproducibility. */
  seed?: number;
}

// ---------------------------------------------------------------------------
// Request builders (pure)
// ---------------------------------------------------------------------------

/** Build the background-removal request for the chosen provider. */
export function buildRemoveBackgroundRequest(
  provider: BgRemovalProvider,
  image: Buffer,
  key: string
): ImageHttpRequest {
  if (provider === "removebg") {
    return {
      url: REMOVEBG_URL,
      method: "POST",
      headers: { "X-Api-Key": key },
      fields: [
        { name: "image_file", value: image, filename: "image.png", contentType: "image/png" },
        { name: "size", value: "auto" },
        { name: "format", value: "png" },
      ],
    };
  }
  // dezgo
  return {
    url: `${DEZGO_BASE}/remove-background`,
    method: "POST",
    headers: { "X-Dezgo-Key": key },
    fields: [
      { name: "image", value: image, filename: "image.png", contentType: "image/png" },
      { name: "format", value: "png" },
    ],
  };
}

/** Build the generative inpainting request (Dezgo). White mask pixels = change. */
export function buildInpaintRequest(
  _provider: InpaintProvider,
  image: Buffer,
  mask: Buffer,
  prompt: string,
  key: string,
  opts: InpaintOptions = {}
): ImageHttpRequest {
  const fields: ImageHttpRequest["fields"] = [
    { name: "init_image", value: image, filename: "init.png", contentType: "image/png" },
    { name: "mask_image", value: mask, filename: "mask.png", contentType: "image/png" },
    { name: "prompt", value: prompt },
    { name: "format", value: "png" },
  ];
  if (opts.negativePrompt) fields.push({ name: "negative_prompt", value: opts.negativePrompt });
  if (opts.seed !== undefined) fields.push({ name: "seed", value: String(opts.seed) });

  return {
    url: `${DEZGO_BASE}/inpainting`,
    method: "POST",
    headers: { "X-Dezgo-Key": key },
    fields,
  };
}

// ---------------------------------------------------------------------------
// Executor (network)
// ---------------------------------------------------------------------------

/** Execute an ImageHttpRequest and return the binary image body, or throw. */
export async function sendImageRequest(req: ImageHttpRequest): Promise<Buffer> {
  const form = new FormData();
  for (const f of req.fields) {
    if (Buffer.isBuffer(f.value)) {
      const blob = new Blob([new Uint8Array(f.value)], { type: f.contentType ?? "application/octet-stream" });
      form.append(f.name, blob, f.filename ?? "file");
    } else {
      form.append(f.name, f.value);
    }
  }

  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: form });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`AI provider request failed (${res.status} ${res.statusText})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/** Choose a background-removal provider given an explicit choice and available keys. */
export function selectBgProvider(
  explicit: BgRemovalProvider | "auto",
  keys: AiKeys
): { provider: BgRemovalProvider; key: string } {
  if (explicit !== "auto") {
    const key = explicit === "dezgo" ? keys.dezgo : keys.removebg;
    if (!key) throw new Error(missingKeyMessage(explicit));
    return { provider: explicit, key };
  }
  if (keys.removebg) return { provider: "removebg", key: keys.removebg };
  if (keys.dezgo) return { provider: "dezgo", key: keys.dezgo };
  throw new Error(
    "No background-removal API key configured. Set PHOTOPEA_MCP_REMOVEBG_KEY (remove.bg) or PHOTOPEA_MCP_DEZGO_KEY (Dezgo)."
  );
}

export function missingKeyMessage(provider: BgRemovalProvider | InpaintProvider): string {
  if (provider === "removebg") return "remove.bg requires PHOTOPEA_MCP_REMOVEBG_KEY (or REMOVEBG_API_KEY).";
  return "Dezgo requires PHOTOPEA_MCP_DEZGO_KEY (or DEZGO_API_KEY).";
}
