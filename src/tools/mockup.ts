// src/tools/mockup.ts
import { z } from "zod";
import { basename } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import { buildExportImage } from "../bridge/script-builder.js";
import { buildMockupReplace } from "../bridge/script-builder-advanced.js";
import { readLocalFile, fetchUrlToBuffer, isUrl, writeLocalFile } from "../utils/file-io.js";
import { imageContent, textContent, isRasterFormat } from "../utils/mcp-content.js";

export function registerMockupTools(server: McpServer, bridge: PhotopeaBridge): void {
  server.registerTool("photopea_mockup_replace", {
    title: "Mockup: Replace Placeholder",
    description:
      "Mockup automation: take a template (PSD/PNG) with a named placeholder layer and fit a replacement image into that layer's bounds, then export. Ideal for batch product mockups (posters, screens, labels). Note: this fits and clips a pasted layer to the placeholder's rectangle — it does NOT do perspective/smart-object warp (not possible in headless Photopea).",
    inputSchema: {
      templateSource: z.string().optional().describe("Path or URL of the template (PSD/PNG) to open. Omit to use the already-open active document as the template."),
      targetLayer: z.string().describe("Name of the placeholder layer in the template to replace."),
      replacement: z.string().describe("Path or URL of the image to fit into the placeholder."),
      fit: z.enum(["fill", "fit"]).default("fill").describe("'fill' covers the whole placeholder (may crop); 'fit' shows the whole image inside it."),
      clip: z.boolean().default(true).describe("Clip the pasted image to the placeholder so overflow is hidden (recommended for 'fill')."),
      outputPath: z.string().optional().describe("Absolute path to save the result. Optional."),
      format: z.enum(["png", "jpg", "webp"]).default("png").describe("Output format when saving/returning."),
      inline: z.boolean().default(true).describe("Return the result inline as an image so you can see it."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const { templateSource, targetLayer, replacement, fit, clip, outputPath, format, inline } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "mockup_replace", summary: `Mockup: ${targetLayer}` });

    try {
      // 1) Open the template if provided (becomes the active document).
      if (templateSource) {
        const tplData = isUrl(templateSource) ? await fetchUrlToBuffer(templateSource) : await readLocalFile(templateSource);
        const tplLoad = await bridge.loadFile(tplData, basename(templateSource.split("?")[0]) || "template");
        if (!tplLoad.success) throw new Error(tplLoad.error || "failed to open template");
      }

      // 2) Load the replacement image (opens as the active document, above the template).
      const repData = isUrl(replacement) ? await fetchUrlToBuffer(replacement) : await readLocalFile(replacement);
      const repLoad = await bridge.loadFile(repData, basename(replacement.split("?")[0]) || "replacement");
      if (!repLoad.success) throw new Error(repLoad.error || "failed to open replacement image");

      // 3) Copy the replacement, close it, then fit it into the placeholder.
      const composite = [
        `var _src = app.activeDocument;`,
        `_src.selection.selectAll();`,
        `_src.selection.copy(true);`,
        `_src.close(2);`,
        buildMockupReplace({ targetLayer, fit, clip }),
      ].join("\n");
      const ran = await bridge.executeScript(composite);
      if (!ran.success) throw new Error(ran.error || `failed to replace placeholder '${targetLayer}' (does the layer exist at the top level?)`);

      // 4) Export.
      const exp = await bridge.executeScript(buildExportImage({ format }), true);
      if (!exp.success) throw new Error(exp.error || "export failed");
      const file = exp as BridgeFileResult;

      let savedNote = "";
      if (outputPath) {
        await writeLocalFile(outputPath, file.data);
        savedNote = `Saved to ${outputPath}. `;
      }

      const content: Array<ReturnType<typeof imageContent> | ReturnType<typeof textContent>> = [];
      if (inline && isRasterFormat(format)) content.push(imageContent(file.data, file.mimeType));
      content.push(textContent(`${savedNote}Mockup '${targetLayer}' replaced (${file.data.length} bytes)`));
      return { content };
    } catch (err) {
      return { isError: true, content: [textContent((err as Error).message)] };
    }
  });
}
