// scripts/smoke-headless.mjs
//
// End-to-end smoke test for headless mode. Boots the bridge with the headless
// Playwright launcher, waits for Photopea to load, creates a small document,
// fills it green, exports a PNG, and verifies the returned bytes are a real PNG.
//
// Run:  node scripts/smoke-headless.mjs

import { readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { createBrowserLauncher } from "../dist/browser/launcher.js";
import { findAvailablePort } from "../dist/utils/platform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function log(...args) {
  console.log("[smoke]", ...args);
}

async function main() {
  const port = await findAvailablePort(4117);
  const launcher = createBrowserLauncher({ headless: true });
  const bridge = new PhotopeaBridge(port, launcher);

  // Serve the frontend, same as src/index.ts does.
  const frontendHtml = readFileSync(
    join(projectRoot, "src", "frontend", "index.html"),
    "utf-8"
  );
  bridge.getHttpServer().on("request", (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(frontendHtml);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await bridge.start();
  log(`bridge on http://127.0.0.1:${port} — launching headless Chromium...`);

  const t0 = Date.now();
  await bridge.waitForReady();
  log(`Photopea ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // COMBINED single-call: create + fill + export in ONE script. This is the
  // exact case the early-"done" race used to break (export buffer was lost).
  // With the sentinel fix it must now return the PNG.
  const combinedScript =
    "app.documents.add(120,80);" +
    "var d=app.activeDocument;" +
    "d.selection.selectAll();" +
    "var c=new SolidColor(); c.rgb.red=0; c.rgb.green=200; c.rgb.blue=80;" +
    "d.selection.fill(c);" +
    "d.selection.deselect();" +
    "app.echoToOE('created:' + app.documents.length);" +
    "app.activeDocument.saveToOE('png');";
  const res = await bridge.executeScript(combinedScript, true);

  const buf = res.data;
  const isBuffer = Buffer.isBuffer(buf);
  const sig = isBuffer ? buf.subarray(0, 8).toString("hex") : "(no buffer)";
  const isPng = isBuffer && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

  log("success:", res.success);
  log("mimeType:", res.mimeType);
  log("bytes:", isBuffer ? buf.length : 0);
  log("sig:", sig, "| PNG:", isPng);

  // Echo path: a script that returns data via echoToOE (no document open noise).
  const echoRes = await bridge.executeScript("app.echoToOE('docs=' + app.documents.length);");
  log("echo:", echoRes.success, "| data:", echoRes.data);
  const echoOk = echoRes.success && typeof echoRes.data === "string" && echoRes.data.indexOf("docs=") === 0;

  // Completion-after-error: a swallowed runtime error must still COMPLETE
  // (resolve, not hang) thanks to the OK sentinel. Photopea swallows some
  // runtime errors silently, so we assert completion, not error classification.
  const errRes = await bridge.executeScript("nonexistentFunctionXYZ();");
  log("after-swallowed-error:", "resolved=", errRes !== null, "| success:", errRes.success);
  const completes = errRes !== null; // resolved within timeout = sentinel worked

  await bridge.stop();

  if (res.success && isPng && echoOk && completes) {
    log("RESULT: PASS ✅  (combined create+export PNG, echo, and post-error completion all work)");
    process.exit(0);
  } else {
    log(`RESULT: FAIL ❌  (png=${res.success && isPng} echo=${echoOk} completes=${completes})`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
