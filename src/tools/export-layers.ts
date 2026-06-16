// src/tools/export-layers.ts
import { z } from "zod";
import { join } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult, BridgeResult } from "../bridge/types.js";
import { buildGetLayers, buildExportImage } from "../bridge/script-builder.js";
import { buildIsolateTopLayer, buildShowAllTopLayers } from "../bridge/script-builder-advanced.js";
import { writeLocalFile } from "../utils/file-io.js";
import { textContent } from "../utils/mcp-content.js";

interface TopLayer {
  name: string;
  index: number;
  visible: boolean;
}

/** Make a layer name safe to use as a filename. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "layer";
}

export function registerExportLayersTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_export_layers", {
    title: "Export Layers Separately",
    description: "Export each top-level layer of the active document as its own image file in a folder — for slicing a design into assets (icons, sprites, UI pieces). Each layer is exported on its own over a transparent canvas. Restores layer visibility afterward.",
    inputSchema: {
      outputDir: z.string().describe("Absolute folder path to write the per-layer files (created if missing)"),
      format: z.enum(["png", "webp"]).default("png").describe("Output format (png/webp keep transparency)"),
      onlyVisible: z.boolean().default(true).describe("Export only layers that are currently visible (skip hidden ones)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const { outputDir, format, onlyVisible } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "export_layers", summary: `Export layers → ${format}` });

    // 1) Read the top-level layer list.
    const treeRes = await bridge.executeScript(buildGetLayers());
    if (!treeRes.success) return { isError: true, content: [textContent((treeRes as BridgeResult).error || "Failed to read layers")] };
    let top: TopLayer[];
    try {
      const tree = JSON.parse((treeRes as BridgeResult).data || "[]") as Array<{ name: string; index: number; visible: boolean }>;
      top = tree.map((l) => ({ name: l.name, index: l.index, visible: l.visible }));
    } catch {
      return { isError: true, content: [textContent("Could not parse layer tree")] };
    }

    const targets = onlyVisible ? top.filter((l) => l.visible) : top;
    if (targets.length === 0) return { content: [textContent("No layers to export.")] };

    // 2) Isolate + export each.
    const outputs: string[] = [];
    const errors: string[] = [];
    for (const layer of targets) {
      const iso = await bridge.executeScript(buildIsolateTopLayer(layer.index));
      if (!iso.success) { errors.push(`${layer.name}: ${(iso as BridgeResult).error}`); continue; }
      const exp = await bridge.executeScript(buildExportImage({ format }), true);
      if (!exp.success) { errors.push(`${layer.name}: ${(exp as BridgeResult).error}`); continue; }
      const outPath = join(outputDir, `${String(layer.index).padStart(2, "0")}_${safeName(layer.name)}.${format}`);
      try {
        await writeLocalFile(outPath, (exp as BridgeFileResult).data);
        outputs.push(outPath);
      } catch (err) {
        errors.push(`${layer.name}: ${(err as Error).message}`);
      }
    }

    // 3) Restore visibility.
    await bridge.executeScript(buildShowAllTopLayers());

    const lines = [
      `Exported ${outputs.length}/${targets.length} layer(s) to ${outputDir}:`,
      ...outputs.map((p) => `✓ ${p}`),
      ...errors.map((e) => `✗ ${e}`),
    ];
    return { content: [textContent(lines.join("\n"))] };
  });
}
