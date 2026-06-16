// src/tools/adjustment-layer.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { buildAddAdjustmentLayer } from "../bridge/script-builder-advanced.js";
import { textContent } from "../utils/mcp-content.js";

export function registerAdjustmentLayerTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_add_adjustment_layer", {
    title: "Add Adjustment Layer",
    description: "Add a NON-DESTRUCTIVE adjustment layer above the active layer — unlike apply_adjustment, which writes directly to pixels. The adjustment can be re-edited or deleted later. Affects all layers below it. Supported: 'brightness' (brightness/contrast), 'hue_sat' (hue/saturation/lightness), and 'levels' (input black/white + gamma).",
    inputSchema: {
      type: z.enum(["brightness", "hue_sat", "levels"]).describe("'brightness' for brightness/contrast, 'hue_sat' for hue/saturation/lightness, 'levels' for input levels + gamma"),
      settings: z.object({
        brightness: z.number().min(-150).max(150).optional().describe("brightness: -150..150"),
        contrast: z.number().min(-50).max(100).optional().describe("brightness: contrast -50..100"),
        hue: z.number().min(-180).max(180).optional().describe("hue_sat: hue shift -180..180"),
        saturation: z.number().min(-100).max(100).optional().describe("hue_sat: saturation -100..100"),
        lightness: z.number().min(-100).max(100).optional().describe("hue_sat: lightness -100..100"),
        inputMin: z.number().min(0).max(255).optional().describe("levels: input black point 0..255"),
        inputMax: z.number().min(0).max(255).optional().describe("levels: input white point 0..255"),
        gamma: z.number().min(0.1).max(9.99).optional().describe("levels: midtone gamma 0.1..9.99"),
      }).optional().describe("Adjustment values; keys depend on type"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "add_adjustment_layer", summary: `Add ${params.type} adjustment layer` });
    const result = await bridge.executeScript(buildAddAdjustmentLayer(params));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to add adjustment layer")] };
    return { content: [textContent(`Non-destructive ${params.type} adjustment layer added`)] };
  });
}
