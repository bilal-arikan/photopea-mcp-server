// src/tools/canvas.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { buildCrop, buildTrim, buildRotateCanvas, buildCropAspect } from "../bridge/script-builder-advanced.js";
import { textContent } from "../utils/mcp-content.js";

// Common aspect-ratio presets → [width, height].
const ASPECT_PRESETS: Record<string, [number, number]> = {
  "1:1": [1, 1],
  "4:3": [4, 3],
  "3:4": [3, 4],
  "3:2": [3, 2],
  "2:3": [2, 3],
  "16:9": [16, 9],
  "9:16": [9, 16],
  "4:5": [4, 5],
  "5:4": [5, 4],
  "21:9": [21, 9],
};

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

  server.registerTool("photopea_crop_aspect", {
    title: "Crop to Aspect Ratio",
    description: "Crop the canvas to a target aspect ratio with a centered crop (trims the excess on the longer axis). Use a preset (e.g. '1:1' for square, '16:9' for video, '4:5' for Instagram portrait) or 'custom' with ratioW/ratioH. The whole canvas content is kept centered.",
    inputSchema: {
      preset: z.enum(["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "4:5", "5:4", "21:9", "custom"]).describe("Aspect-ratio preset, or 'custom' to provide ratioW/ratioH"),
      ratioW: z.number().positive().optional().describe("Custom aspect width (required when preset = 'custom')"),
      ratioH: z.number().positive().optional().describe("Custom aspect height (required when preset = 'custom')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    let rw: number, rh: number;
    if (params.preset === "custom") {
      if (!params.ratioW || !params.ratioH) {
        return { isError: true, content: [textContent("preset 'custom' requires both ratioW and ratioH")] };
      }
      rw = params.ratioW;
      rh = params.ratioH;
    } else {
      [rw, rh] = ASPECT_PRESETS[params.preset];
    }
    const label = params.preset === "custom" ? `${rw}:${rh}` : params.preset;
    bridge.sendActivity({ type: "activity", id: "", tool: "crop_aspect", summary: `Crop to ${label}` });
    const result = await bridge.executeScript(buildCropAspect(rw, rh));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to crop to aspect ratio")] };
    return { content: [textContent(`Cropped to ${label} (centered)`)] };
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
