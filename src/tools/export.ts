// src/tools/export.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import {
  buildExportImage,
  buildRunScript,
  buildUndo,
  buildRedo,
  escapeString,
} from "../bridge/script-builder.js";
import { writeLocalFile } from "../utils/file-io.js";
import { imageContent, textContent, isRasterFormat } from "../utils/mcp-content.js";

export function registerExportTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 30. photopea_export_image
  server.registerTool("photopea_export_image", {
    title: "Export Image",
    description: "Export the active document, flattened, in the chosen format. Save it to disk (outputPath), return it inline as base64 so you can SEE it (inline), or both. At least one of outputPath/inline must be effective. PNG/JPG/WebP can be returned inline; PSD requires outputPath; SVG is returned as text when inline.",
    inputSchema: {
      format: z.enum(["png", "jpg", "webp", "psd", "svg"]).describe("Output format: 'png' for lossless, 'jpg' for compressed photos, 'webp' for web, 'psd' for Photoshop, 'svg' for vector"),
      quality: z.number().min(1).max(100).optional().describe("Compression quality for JPG format only (1 = smallest file, 100 = best quality). Ignored for other formats."),
      outputPath: z.string().optional().describe("Absolute local file path to save the export (e.g. /Users/me/output.png). Optional — omit to return the image inline only."),
      inline: z.boolean().default(true).describe("Return the exported image inline (base64) so the AI can see it. Set false for very large full-resolution images to save tokens. Ignored for PSD."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const target = params.outputPath ? `to ${params.outputPath}` : "inline";
    const script = buildExportImage(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "export_image", summary: `Export as ${params.format} ${target}` });
    const rawResult = await bridge.executeScript(script, true);
    if (!rawResult.success) return { isError: true, content: [textContent(rawResult.error || "Failed to export image")] };

    const fileResult = rawResult as BridgeFileResult;

    // Write to disk if a path was provided.
    let savedNote = "";
    if (params.outputPath) {
      try {
        await writeLocalFile(params.outputPath, fileResult.data);
        savedNote = `Saved to ${params.outputPath}. `;
      } catch (err) {
        return { isError: true, content: [textContent(`Export succeeded but failed to write file: ${(err as Error).message}`)] };
      }
    }

    const content: Array<ReturnType<typeof imageContent> | ReturnType<typeof textContent>> = [];
    const raster = isRasterFormat(params.format);

    if (params.inline && raster) {
      content.push(imageContent(fileResult.data, fileResult.mimeType));
    } else if (params.inline && params.format === "svg") {
      // SVG is text — return its source so the AI can read/transform it.
      content.push(textContent(fileResult.data.toString("utf-8")));
    } else if (params.inline && params.format === "psd" && !params.outputPath) {
      return { isError: true, content: [textContent("PSD cannot be returned inline. Provide outputPath to export a PSD.")] };
    }

    if (!params.outputPath && content.length === 0) {
      return { isError: true, content: [textContent("Nothing exported: provide outputPath or enable inline (raster/svg only).")] };
    }

    content.push(textContent(`${savedNote}${params.format.toUpperCase()} export (${fileResult.data.length} bytes)`));
    return { content };
  });

  // photopea_load_font
  server.registerTool("photopea_load_font", {
    title: "Load Font",
    description: "Load a custom font from a URL (TTF, OTF, or WOFF2) into Photopea. The font becomes available for add_text and edit_text. Use list_fonts to find the PostScript name after loading.",
    inputSchema: {
      url: z.string().describe("URL to a font file (.ttf, .otf, or .woff2)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params) => {
    // Loading a font via app.open() opens it as a "document" -- we need to track the current doc and switch back
    const script = [
      `var _docName = app.activeDocument ? app.activeDocument.name : null;`,
      `app.open('${escapeString(params.url)}');`,
      `if (_docName) { app.activeDocument = app.documents.getByName(_docName); }`,
      `app.echoToOE('ok');`,
    ].join("\n");
    bridge.sendActivity({ type: "activity", id: "", tool: "load_font", summary: `Load font: ${params.url.split("/").pop()}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to load font" }] };
    return { content: [{ type: "text" as const, text: `Font loaded from: ${params.url}. Use list_fonts to find its PostScript name.` }] };
  });

  // photopea_list_fonts
  server.registerTool("photopea_list_fonts", {
    title: "List Fonts",
    description: "List available fonts in Photopea. Returns font PostScript names that can be used with add_text and edit_text.",
    inputSchema: {
      search: z.string().optional().describe("Optional search string to filter fonts by name"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const search = params.search?.toLowerCase();
    const script = search
      ? `var r=[];for(var i=0;i<app.fonts.length;i++){var n=app.fonts[i].postScriptName;if(n.toLowerCase().indexOf('${search}')>=0)r.push(n);}app.echoToOE(JSON.stringify(r));`
      : `var r=[];for(var i=0;i<app.fonts.length;i++){r.push(app.fonts[i].postScriptName);}app.echoToOE(JSON.stringify(r));`;
    bridge.sendActivity({ type: "activity", id: "", tool: "list_fonts", summary: `List fonts${search ? `: ${search}` : ""}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to list fonts" }] };
    const data = (result as import("../bridge/types.js").BridgeResult).data || "[]";
    return { content: [{ type: "text" as const, text: data }] };
  });

  // 33. photopea_run_script
  server.registerTool("photopea_run_script", {
    title: "Run Script",
    description: "Execute arbitrary Photopea/ExtendScript JavaScript in the Photopea environment. Use this for advanced operations not covered by other tools. Has full access to the Photopea DOM (app, activeDocument, layers). Use with caution — scripts can modify or delete any document data.",
    inputSchema: {
      script: z.string().describe("Photopea JavaScript code to execute. Must call app.echoToOE(result) to return data. Has access to the full Photopea scripting API (app, activeDocument, etc.)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildRunScript(params.script);
    bridge.sendActivity({ type: "activity", id: "", tool: "run_script", summary: "Run custom script" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Script execution failed" }] };
    const scriptResult = result as import("../bridge/types.js").BridgeResult;
    return { content: [{ type: "text" as const, text: scriptResult.data ?? "Script executed successfully" }] };
  });

  // 34. photopea_undo
  server.registerTool("photopea_undo", {
    title: "Undo",
    description: "Undo one or more recent actions in the active document. Each step reverses one operation from the history. Use after destructive operations (apply_filter, apply_adjustment, fill_selection) to revert changes.",
    inputSchema: {
      steps: z.number().int().positive().default(1).describe("Number of history steps to undo (default 1)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildUndo(params.steps);
    bridge.sendActivity({ type: "activity", id: "", tool: "undo", summary: `Undo ${params.steps} step(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to undo" }] };
    return { content: [{ type: "text" as const, text: `Undid ${params.steps} step(s)` }] };
  });

  // 35. photopea_redo
  server.registerTool("photopea_redo", {
    title: "Redo",
    description: "Redo one or more previously undone actions in the active document. Only available after using undo — the redo history is cleared when new actions are performed.",
    inputSchema: {
      steps: z.number().int().positive().default(1).describe("Number of history steps to redo (default 1)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildRedo(params.steps);
    bridge.sendActivity({ type: "activity", id: "", tool: "redo", summary: `Redo ${params.steps} step(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to redo" }] };
    return { content: [{ type: "text" as const, text: `Redid ${params.steps} step(s)` }] };
  });
}
