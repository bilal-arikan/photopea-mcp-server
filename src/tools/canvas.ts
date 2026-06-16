// src/tools/canvas.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { buildCrop, buildTrim, buildRotateCanvas } from "../bridge/script-builder-advanced.js";
import { textContent } from "../utils/mcp-content.js";

export function registerCanvasTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_crop", {
    title: "Crop Canvas",
    description: "Crop the active document to a rectangular region (pixels). Everything outside the region is removed and the canvas is resized to the region. Use get_document_info to check dimensions first.",
    inputSchema: {
      x: z.number().describe("Left edge X of the crop region in pixels"),
      y: z.number().describe("Top edge Y of the crop region in pixels"),
      width: z.number().positive().describe("Crop width in pixels"),
      height: z.number().positive().describe("Crop height in pixels"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "crop", summary: `Crop to ${params.width}x${params.height}` });
    const result = await bridge.executeScript(buildCrop(params));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to crop")] };
    return { content: [textContent(`Cropped to ${params.width}x${params.height} at (${params.x},${params.y})`)] };
  });

  server.registerTool("photopea_trim", {
    title: "Trim Canvas",
    description: "Trim away uniform borders around the document. 'transparent' trims transparent edges; 'topLeft'/'bottomRight' trim edges matching that corner pixel's color. Useful after removing a background or placing content.",
    inputSchema: {
      basedOn: z.enum(["transparent", "topLeft", "bottomRight"]).default("transparent").describe("What to trim: transparent pixels, or pixels matching the top-left / bottom-right corner color"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "trim", summary: `Trim (${params.basedOn})` });
    const result = await bridge.executeScript(buildTrim(params.basedOn));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to trim")] };
    return { content: [textContent(`Trimmed (${params.basedOn})`)] };
  });

  server.registerTool("photopea_rotate_canvas", {
    title: "Rotate Canvas",
    description: "Rotate the entire canvas by a number of degrees (clockwise). 90/180/270 give clean orientation changes; arbitrary angles enlarge the canvas to fit. Rotates all layers together.",
    inputSchema: {
      degrees: z.number().describe("Rotation in degrees, clockwise (e.g. 90, 180, 270, or any angle)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "rotate_canvas", summary: `Rotate ${params.degrees}°` });
    const result = await bridge.executeScript(buildRotateCanvas(params.degrees));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to rotate canvas")] };
    return { content: [textContent(`Canvas rotated ${params.degrees}°`)] };
  });
}
