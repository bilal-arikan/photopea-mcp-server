// src/ai/providers.ts
// Pure request builders + a thin fetch executor for the Dezgo AI image API.
// The builders return plain ImageHttpRequest descriptors so they can be
// unit-tested without any network access.

import type { ImageHttpRequest } from "./types.js";

const DEZGO_BASE = "https://api.dezgo.com";

export interface InpaintOptions {
  /** Optional negative prompt (things to avoid). */
  negativePrompt?: string;
  /** Optional fixed seed for reproducibility. */
  seed?: number;
}

// ---------------------------------------------------------------------------
// Request builders (pure)
// ---------------------------------------------------------------------------

/** Build the Dezgo background-removal request. */
export function buildRemoveBackgroundRequest(image: Buffer, key: string): ImageHttpRequest {
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

/** Build the Dezgo generative inpainting request. White mask pixels = change. */
export function buildInpaintRequest(
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
    throw new Error(`Dezgo request failed (${res.status} ${res.statusText})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Standard error when no Dezgo key is configured. */
export const MISSING_DEZGO_KEY =
  "Dezgo requires PHOTOPEA_MCP_DEZGO_KEY (or DEZGO_API_KEY).";
