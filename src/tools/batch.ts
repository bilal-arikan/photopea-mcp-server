// src/tools/batch.ts
import { z } from "zod";
import { basename, extname, join } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import { buildExportImage } from "../bridge/script-builder.js";
import { readLocalFile, fetchUrlToBuffer, isUrl, writeLocalFile } from "../utils/file-io.js";
import { textContent } from "../utils/mcp-content.js";

interface BatchItemResult {
  source: string;
  output: string | null;
  ok: boolean;
  error?: string;
}

export function registerBatchTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_batch_process", {
    title: "Batch Process",
    description: "Open each input image, optionally run the same Photopea script on it, then export it to a folder. The workhorse for automation: watermarking, resizing, format conversion, or any repeatable edit across many files. Each file is processed independently; one failure does not stop the rest.",
    inputSchema: {
      sources: z.array(z.string()).min(1).describe("Absolute local paths or URLs of the images to process"),
      script: z.string().optional().describe("Optional Photopea JavaScript run on each opened document (operates on app.activeDocument). Omit to only convert/re-export. Do NOT export or close the document in the script — the tool does that."),
      format: z.enum(["png", "jpg", "webp"]).default("png").describe("Output image format"),
      quality: z.number().min(1).max(100).optional().describe("JPG quality 1-100 (ignored for other formats)"),
      outputDir: z.string().describe("Absolute folder path where processed files are written (created if missing)"),
      suffix: z.string().default("").describe("Optional filename suffix before the extension (e.g. '_processed')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const { sources, script, format, quality, outputDir, suffix } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "batch_process", summary: `Batch ${sources.length} file(s) → ${format}` });

    const results: BatchItemResult[] = [];

    for (const source of sources) {
      const item: BatchItemResult = { source, output: null, ok: false };
      try {
        // 1) Load the file into Photopea (opens as the active document).
        const data = isUrl(source) ? await fetchUrlToBuffer(source) : await readLocalFile(source);
        const filename = basename(source.split("?")[0]) || "image";
        const load = await bridge.loadFile(data, filename);
        if (!load.success) throw new Error(load.error || "failed to open");

        // 2) Optional per-file script.
        if (script && script.trim()) {
          const ran = await bridge.executeScript(`${script}\n;app.echoToOE('ok');`);
          if (!ran.success) throw new Error(ran.error || "script failed");
        }

        // 3) Export and save.
        const exp = await bridge.executeScript(buildExportImage({ format, quality }), true);
        if (!exp.success) throw new Error(exp.error || "export failed");
        const base = basename(filename, extname(filename));
        const outPath = join(outputDir, `${base}${suffix}.${format}`);
        await writeLocalFile(outPath, (exp as BridgeFileResult).data);
        item.output = outPath;
        item.ok = true;
      } catch (err) {
        item.error = (err as Error).message;
      } finally {
        // 4) Close the processed document so the next file starts clean.
        await bridge.executeScript(`try { app.activeDocument.close(2); } catch(e) {}\n;app.echoToOE('ok');`);
      }
      results.push(item);
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    const lines = results.map((r) => (r.ok ? `✓ ${r.source} → ${r.output}` : `✗ ${r.source}: ${r.error}`));
    return {
      content: [textContent(`Batch complete: ${ok} succeeded, ${failed} failed.\n${lines.join("\n")}`)],
    };
  });
}
