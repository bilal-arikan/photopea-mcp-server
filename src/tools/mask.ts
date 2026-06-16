// src/tools/mask.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildAddLayerMask,
  buildApplyLayerMask,
  buildDeleteLayerMask,
  buildSetClippingMask,
} from "../bridge/script-builder-advanced.js";
import { textContent } from "../utils/mcp-content.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name (string) or index (number)");

export function registerMaskTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_add_layer_mask", {
    title: "Add Layer Mask",
    description: "Add a non-destructive pixel mask to the active layer. 'all' reveals everything (white mask), 'none' hides everything (black mask). Then paint/fill on the mask (e.g. via fill_selection while the mask is targeted) to control what shows. Use select_layer to target a layer first.",
    inputSchema: {
      reveal: z.enum(["all", "none"]).default("all").describe("'all' = reveal everything (white), 'none' = hide everything (black)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "add_layer_mask", summary: `Add layer mask (${params.reveal})` });
    const result = await bridge.executeScript(buildAddLayerMask(params.reveal));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to add layer mask")] };
    return { content: [textContent(`Layer mask added (reveal: ${params.reveal})`)] };
  });

  server.registerTool("photopea_apply_layer_mask", {
    title: "Apply Layer Mask",
    description: "Permanently apply (bake) the active layer's mask into its pixels and remove the mask. This is destructive — masked-out areas become transparent. Use add_layer_mask first.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async () => {
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_layer_mask", summary: "Apply layer mask" });
    const result = await bridge.executeScript(buildApplyLayerMask());
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to apply layer mask")] };
    return { content: [textContent("Layer mask applied")] };
  });

  server.registerTool("photopea_delete_layer_mask", {
    title: "Delete Layer Mask",
    description: "Remove the active layer's mask without applying it, restoring the layer's full visibility. Use add_layer_mask to create one.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async () => {
    bridge.sendActivity({ type: "activity", id: "", tool: "delete_layer_mask", summary: "Delete layer mask" });
    const result = await bridge.executeScript(buildDeleteLayerMask());
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to delete layer mask")] };
    return { content: [textContent("Layer mask deleted")] };
  });

  server.registerTool("photopea_set_clipping_mask", {
    title: "Set Clipping Mask",
    description: "Clip a layer to the layer directly below it (or release the clip). A clipped layer only shows where the layer below has pixels — the non-destructive way to confine a texture or photo to a shape. The clipping layer must sit directly above the base layer.",
    inputSchema: {
      target: layerTarget,
      enabled: z.boolean().default(true).describe("true = clip to the layer below; false = release the clip"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "set_clipping_mask", summary: `Clip ${params.target}: ${params.enabled}` });
    const result = await bridge.executeScript(buildSetClippingMask(params.target, params.enabled));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to set clipping mask")] };
    return { content: [textContent(`Clipping mask ${params.enabled ? "enabled" : "released"} on ${params.target}`)] };
  });
}
