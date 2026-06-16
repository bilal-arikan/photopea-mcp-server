// src/tools/select-color.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { hexToRgb } from "../bridge/script-builder.js";
import { buildMagicWandSelect, buildReplaceColor } from "../bridge/script-builder-advanced.js";
import { textContent } from "../utils/mcp-content.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Color as hex string (e.g. #ff0000)");

export function registerSelectColorTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_magic_wand_select", {
    title: "Magic Wand Select",
    description: "Select the contiguous region of similar-colored pixels around a point (magic wand). Higher tolerance selects a wider color range. After selecting, use fill_selection, modify_selection, or clear_selection. Coordinates are in document pixels.",
    inputSchema: {
      x: z.number().min(0).describe("X coordinate to sample/select from, in pixels"),
      y: z.number().min(0).describe("Y coordinate to sample/select from, in pixels"),
      tolerance: z.number().min(0).max(255).default(32).describe("Color match tolerance (0 = exact, 255 = everything). Default 32."),
      antiAlias: z.boolean().default(true).describe("Smooth the selection edges"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "magic_wand_select", summary: `Magic wand (${params.x},${params.y}) tol ${params.tolerance}` });
    const result = await bridge.executeScript(buildMagicWandSelect(params.x, params.y, params.tolerance, params.antiAlias));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to magic-wand select")] };
    return { content: [textContent(`Magic-wand selected region at (${params.x},${params.y}), tolerance ${params.tolerance}`)] };
  });

  server.registerTool("photopea_replace_color", {
    title: "Replace Color",
    description: "Replace the contiguous color region around a point with a new color — fast product/UI color variants. Magic-wand selects from (x,y) within tolerance, fills with the new color, then deselects. For multiple separate regions, call once per region.",
    inputSchema: {
      x: z.number().min(0).describe("X coordinate of the region to replace, in pixels"),
      y: z.number().min(0).describe("Y coordinate of the region to replace, in pixels"),
      color: hexColor,
      tolerance: z.number().min(0).max(255).default(32).describe("Color match tolerance (0 = exact). Default 32."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "replace_color", summary: `Replace color at (${params.x},${params.y}) → ${params.color}` });
    const result = await bridge.executeScript(buildReplaceColor(params.x, params.y, hexToRgb(params.color), params.tolerance));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to replace color")] };
    return { content: [textContent(`Replaced color region at (${params.x},${params.y}) with ${params.color}`)] };
  });
}
