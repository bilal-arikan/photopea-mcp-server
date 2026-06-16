// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "./bridge/websocket-server.js";
import { registerDocumentTools } from "./tools/document.js";
import { registerLayerTools } from "./tools/layer.js";
import { registerTextTools } from "./tools/text.js";
import { registerImageTools } from "./tools/image.js";
import { registerExportTools } from "./tools/export.js";
import { registerPreviewTools } from "./tools/preview.js";
import { registerAiTools } from "./tools/ai.js";
import { registerCanvasTools } from "./tools/canvas.js";
import { registerMaskTools } from "./tools/mask.js";
import { registerAdjustmentLayerTools } from "./tools/adjustment-layer.js";
import { registerBatchTools } from "./tools/batch.js";
import { registerMockupTools } from "./tools/mockup.js";
import { registerMergeTools } from "./tools/merge.js";
import { registerExportLayersTools } from "./tools/export-layers.js";

export function createServer(bridge: PhotopeaBridge): McpServer {
  const server = new McpServer({ name: "photopea-mcp-server", version: "0.1.0" });
  registerDocumentTools(server, bridge);
  registerLayerTools(server, bridge);
  registerTextTools(server, bridge);
  registerImageTools(server, bridge);
  registerExportTools(server, bridge);
  registerPreviewTools(server, bridge);
  registerAiTools(server, bridge);
  registerCanvasTools(server, bridge);
  registerMaskTools(server, bridge);
  registerAdjustmentLayerTools(server, bridge);
  registerBatchTools(server, bridge);
  registerMockupTools(server, bridge);
  registerMergeTools(server, bridge);
  registerExportLayersTools(server, bridge);
  return server;
}
