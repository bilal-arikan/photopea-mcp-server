// src/tools/merge.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { buildMergeLayers } from "../bridge/script-builder-advanced.js";
import { textContent } from "../utils/mcp-content.js";

export function registerMergeTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_merge_layers", {
    title: "Merge / Flatten Layers",
    description: "Combine layers. 'flatten' merges everything into one background layer; 'visible' merges all currently-visible layers; 'down' merges the active layer into the one below it. Destructive — use undo to revert.",
    inputSchema: {
      mode: z.enum(["flatten", "visible", "down"]).default("flatten").describe("'flatten' = whole document, 'visible' = all visible layers, 'down' = active layer into the one below"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "merge_layers", summary: `Merge (${params.mode})` });
    const result = await bridge.executeScript(buildMergeLayers(params.mode));
    if (!result.success) return { isError: true, content: [textContent(result.error || "Failed to merge layers")] };
    return { content: [textContent(`Layers merged (${params.mode})`)] };
  });
}
