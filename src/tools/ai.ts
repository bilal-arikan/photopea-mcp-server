// src/tools/ai.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import { buildExportImage, buildMaskForRegion } from "../bridge/script-builder.js";
import { resolveAiKeys } from "../ai/config.js";
import { removeBackground, generativeInpaint } from "../ai/index.js";
import { imageContent, textContent } from "../utils/mcp-content.js";

/** Export the active document as a PNG buffer via the bridge. */
async function exportActivePng(bridge: PhotopeaBridge): Promise<Buffer> {
  const res = await bridge.executeScript(buildExportImage({ format: "png" }), true);
  if (!res.success) throw new Error(res.error || "Failed to export active document");
  return (res as BridgeFileResult).data;
}

export function registerAiTools(server: McpServer, bridge: PhotopeaBridge): void {
  // photopea_remove_background
  server.registerTool("photopea_remove_background", {
    title: "Remove Background (AI)",
    description:
      "Remove the background of the active document using Dezgo AI, opening the transparent cutout as a new active document. Requires an API key: set PHOTOPEA_MCP_DEZGO_KEY (or DEZGO_API_KEY). The original document stays open as a separate tab.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async () => {
    const keys = resolveAiKeys();
    bridge.sendActivity({ type: "activity", id: "", tool: "remove_background", summary: "Remove background (Dezgo)" });
    let cutout: Buffer;
    try {
      const png = await exportActivePng(bridge);
      cutout = await removeBackground(png, keys);
    } catch (err) {
      return { isError: true, content: [textContent((err as Error).message)] };
    }
    const load = await bridge.loadFile(cutout, "background-removed.png");
    if (!load.success) {
      return { isError: true, content: [textContent(load.error || "Background removed, but failed to open the result in Photopea")] };
    }
    return {
      content: [
        imageContent(cutout, "image/png"),
        textContent(`Background removed (${cutout.length} bytes). Opened as a new active document.`),
      ],
    };
  });

  // photopea_generative_fill
  server.registerTool("photopea_generative_fill", {
    title: "Generative Fill (AI)",
    description:
      "Generatively fill/replace a rectangular region of the active document from a text prompt (AI inpainting via Dezgo). The result opens as a new active document. Requires PHOTOPEA_MCP_DEZGO_KEY (or DEZGO_API_KEY). Provide the region in pixels; white-masked pixels are what the model regenerates.",
    inputSchema: {
      prompt: z.string().min(1).describe("What to generate in the masked region (e.g. 'a clear blue sky with clouds')."),
      region: z.object({
        x: z.number().describe("Left edge X of the fill region in pixels"),
        y: z.number().describe("Top edge Y of the fill region in pixels"),
        width: z.number().positive().describe("Region width in pixels"),
        height: z.number().positive().describe("Region height in pixels"),
      }).describe("Rectangular region to regenerate."),
      negativePrompt: z.string().optional().describe("Optional: things to avoid in the generated content."),
      seed: z.number().int().optional().describe("Optional: fixed seed for reproducible results."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const keys = resolveAiKeys();
    if (!keys.dezgo) {
      return { isError: true, content: [textContent("Generative fill requires PHOTOPEA_MCP_DEZGO_KEY (or DEZGO_API_KEY).")] };
    }
    bridge.sendActivity({ type: "activity", id: "", tool: "generative_fill", summary: `Generative fill: ${params.prompt.slice(0, 40)}` });

    let result: Buffer;
    try {
      // 1) init image (current canvas) and 2) mask for the region — two exports.
      const initPng = await exportActivePng(bridge);
      const maskRes = await bridge.executeScript(buildMaskForRegion(params.region), true);
      if (!maskRes.success) throw new Error(maskRes.error || "Failed to render inpainting mask");
      const maskPng = (maskRes as BridgeFileResult).data;

      // 3) call the provider
      result = await generativeInpaint(initPng, maskPng, params.prompt, keys, {
        negativePrompt: params.negativePrompt,
        seed: params.seed,
      });
    } catch (err) {
      return { isError: true, content: [textContent((err as Error).message)] };
    }

    const load = await bridge.loadFile(result, "generative-fill.png");
    if (!load.success) {
      return { isError: true, content: [textContent(load.error || "Inpaint succeeded, but failed to open the result in Photopea")] };
    }
    return {
      content: [
        imageContent(result, "image/png"),
        textContent(`Generative fill complete (${result.length} bytes). Opened as a new active document.`),
      ],
    };
  });
}
