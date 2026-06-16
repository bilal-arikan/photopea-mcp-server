// src/ai/types.ts
// Types for the optional AI image features (background removal, generative fill).
// These features call Dezgo (the same backend Photopea uses for "Remove BG" /
// "Magic Replace") and require the user's own Dezgo API key.

/** API keys resolved from the environment. */
export interface AiKeys {
  dezgo?: string;
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
