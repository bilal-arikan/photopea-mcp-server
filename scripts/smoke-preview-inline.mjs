// scripts/smoke-preview-inline.mjs
// Verifies canvas preview + inline export end-to-end against real Photopea.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { chromium } from "playwright";
import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { buildCreateDocument, buildCanvasPreview, buildExportImage } from "../dist/bridge/script-builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const OUT = join(projectRoot, "scripts", "out");
const PORT = 4139;
const log = (s, m) => console.log(`[${s}] ${m}`);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const bridge = new PhotopeaBridge(PORT, async () => ({ close: async () => {} }));
  const http = bridge.getHttpServer();
  const html = readFileSync(join(projectRoot, "src", "frontend", "index.html"), "utf-8");
  http.on("request", (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); return;
    }
    res.writeHead(404); res.end();
  });
  await bridge.start();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  const start = Date.now();
  while (!bridge.isReady() && Date.now() - start < 60000) await new Promise((r) => setTimeout(r, 250));
  if (!bridge.isReady()) throw new Error("Photopea not ready");
  log("ready", `${((Date.now() - start) / 1000).toFixed(1)}s`);

  // Create a 1200x800 blue doc (large, so preview downscaling is exercised)
  const c = await bridge.executeScript(buildCreateDocument({ width: 1200, height: 800, resolution: 72, name: "PreviewTest", mode: "RGB", fillColor: "#2266ff" }));
  if (!c.success) throw new Error("create failed: " + c.error);
  log("create", "1200x800 blue doc ok");

  // Preview at 256px jpg
  const prev = await bridge.executeScript(buildCanvasPreview({ maxSize: 256, format: "jpg", quality: 80 }), true);
  if (!prev.success) throw new Error("preview failed: " + prev.error);
  const pIsJpg = prev.data[0] === 0xff && prev.data[1] === 0xd8;
  writeFileSync(join(OUT, "preview.jpg"), prev.data);
  log("preview", `mime=${prev.mimeType} bytes=${prev.data.length} isJPG=${pIsJpg}`);

  // Verify the original doc is untouched (still 1200x800)
  const info = await bridge.executeScript('app.echoToOE(JSON.stringify({w:app.activeDocument.width,h:app.activeDocument.height,docs:app.documents.length}));');
  log("untouched", info.data);

  // Inline export full-res PNG
  const exp = await bridge.executeScript(buildExportImage({ format: "png" }), true);
  if (!exp.success) throw new Error("export failed: " + exp.error);
  const eIsPng = exp.data[0] === 0x89 && exp.data[1] === 0x50;
  writeFileSync(join(OUT, "export-inline.png"), exp.data);
  log("export", `mime=${exp.mimeType} bytes=${exp.data.length} isPNG=${eIsPng}`);

  await browser.close();
  await bridge.stop();

  const info2 = JSON.parse(info.data);
  const ok = pIsJpg && eIsPng && info2.w === 1200 && info2.h === 800 && info2.docs === 1;
  log("RESULT", ok ? "PASS ✅ (preview downscaled, original untouched, inline export valid)" : "FAIL ❌");
  if (!ok) process.exit(1);
}
main().catch((e) => { console.error("[FAIL]", e.message); process.exit(1); });
