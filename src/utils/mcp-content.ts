// src/utils/mcp-content.ts
// Helpers for building MCP tool result content blocks.

/** A raster image content block the MCP client can render inline. */
export function imageContent(data: Buffer, mimeType: string) {
  return {
    type: "image" as const,
    data: data.toString("base64"),
    mimeType,
  };
}

/** A plain text content block. */
export function textContent(text: string) {
  return { type: "text" as const, text };
}

/** Raster formats that can be returned inline as an image the client renders. */
export const RASTER_FORMATS = ["png", "jpg", "webp"] as const;

export function isRasterFormat(format: string): boolean {
  return (RASTER_FORMATS as readonly string[]).includes(format);
}
