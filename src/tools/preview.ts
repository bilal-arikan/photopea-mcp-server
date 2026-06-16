// src/tools/preview.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import { buildCanvasPreview } from "../bridge/script-builder.js";
import { imageContent, textContent } from "../utils/mcp-content.js";

export function registerPreviewTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_get_canvas_preview", {
    title: "Get Canvas Preview",
    description:
      "Render a small, downscaled snapshot of the active document and return it inline as an image so you can SEE the current canvas and decide what to do next. Non-destructive — it works on a throwaway copy and never alters the document. Use this to inspect results after edits, verify composition, or check colors. Keep maxSize small (256-512) to limit token cost.",
    inputSchema: {
      maxSize: z
        .number()
        .int()
        .min(64)
        .max(2048)
        .default(512)
        .describe("Longest-edge size of the preview in pixels (default 512). Smaller = fewer tokens."),
      format: z
        .enum(["jpg", "png"])
        .default("jpg")
        .describe("Preview encoding: 'jpg' is small (best for photos/inspection), 'png' is lossless and keeps transparency."),
      quality: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(80)
        .describe("JPG quality 1-100 (ignored for png)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildCanvasPreview(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "get_canvas_preview", summary: `Preview (${params.maxSize}px ${params.format})` });
    const result = await bridge.executeScript(script, true);
    if (!result.success) {
      return { isError: true, content: [textContent(result.error || "Failed to render canvas preview")] };
    }
    const file = result as BridgeFileResult;
    const mime = params.format === "png" ? "image/png" : "image/jpeg";
    return {
      content: [
        imageContent(file.data, file.mimeType || mime),
        textContent(`Canvas preview (${params.maxSize}px max, ${params.format}, ${file.data.length} bytes)`),
      ],
    };
  });
}
