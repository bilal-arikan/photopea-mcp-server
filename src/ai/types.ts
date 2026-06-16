// src/ai/types.ts
// Types for the optional AI image features (background removal, generative fill).
// These features call third-party providers and require the user's own API key,
// exactly like Photopea's built-in "Remove BG" / "Magic Replace" (powered by Dezgo).

export type BgRemovalProvider = "dezgo" | "removebg";
export type InpaintProvider = "dezgo";

/** API keys resolved from the environment. Each is optional. */
export interface AiKeys {
  dezgo?: string;
  removebg?: string;
}

/**
 * A provider-agnostic description of a multipart/form-data image request.
 * Kept as plain data so it can be unit-tested without performing any network IO.
 */
export interface ImageHttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  /** Multipart fields. File parts carry a Buffer; scalar fields carry a string. */
  fields: ImageHttpField[];
}

export interface ImageHttpField {
  name: string;
  value: string | Buffer;
  /** Present for file parts. */
  filename?: string;
  contentType?: string;
}
