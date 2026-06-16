// src/tools/inspect.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeResult } from "../bridge/types.js";
import { buildGetPixelColor, buildGetImageStats } from "../bridge/script-builder.js";
import { textContent } from "../utils/mcp-content.js";

export function registerInspectTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_get_pixel_color", {
    title: "Get Pixel Color",
    description: "Sample the composite color at a pixel (eyedropper). Returns r/g/b (0-255) and hex so you can read exact colors before matching, filling, or comparing. Coordinates are in document pixels.",
    inputSchema: {
      x: z.number().min(0).describe("X coordinate in pixels"),
      y: z.number().min(0).describe("Y coordinate in pixels"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "get_pixel_color", summary: `Sample (${params.x},${params.y})` });
    const result = await bridge.executeScript(buildGetPixelColor(params.x, params.y));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to sample pixel")] };
    return { content: [textContent((result as BridgeResult).data || "{}")] };
  });

  server.registerTool("photopea_get_image_stats", {
    title: "Get Image Stats",
    description: "Approximate per-channel color statistics (mean/min/max RGB) for the active document, sampled on a grid. Use it to judge overall tone/brightness, pick complementary colors, or check whether an edit changed the image. Returns JSON with width/height, mean, min, max.",
    inputSchema: {
      grid: z.number().int().min(2).max(32).default(8).describe("Grid resolution per axis (grid×grid samples; higher = more accurate, slower). Default 8 = 64 samples."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "get_image_stats", summary: `Image stats (${params.grid}×${params.grid})` });
    const result = await bridge.executeScript(buildGetImageStats(params.grid, params.grid));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to compute image stats")] };
    return { content: [textContent((result as BridgeResult).data || "{}")] };
  });
}
