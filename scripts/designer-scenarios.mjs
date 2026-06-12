// scripts/designer-scenarios.mjs
//
// Runs the 10 designer use-case scenarios end-to-end through the headless
// Photopea bridge on random images, writing outputs to the Output folder.
//
//   node scripts/designer-scenarios.mjs
//
// Each scenario is isolated: a failure in one does not stop the others.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, resolve, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { createBrowserLauncher } from "../dist/browser/launcher.js";
import { findAvailablePort } from "../dist/utils/platform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const IMAGES = "C:/Users/Bilal/Desktop/Projects/photopea-test/Images";
const OUTPUT = "C:/Users/Bilal/Desktop/Projects/photopea-test/Output";
const TMP = "C:/Users/Bilal/Desktop/Projects/photopea-test/.tmp";
const PYTHON = "C:/Python313/python.exe";
mkdirSync(TMP, { recursive: true });

function log(...a) { console.log("[scen]", ...a); }

// Deterministic-ish pseudo-random (no Math.random dependency issues): seed walk.
let _seed = 1337;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }

const allImages = readdirSync(IMAGES).filter((f) =>
  /\.(png|jpe?g|webp)$/i.test(f)
);
function pick() {
  return join(IMAGES, allImages[Math.floor(rnd() * allImages.length)]);
}

function outDir(n, name) {
  const d = join(OUTPUT, `${String(n).padStart(2, "0")}_${name}`);
  mkdirSync(d, { recursive: true });
  return d;
}

// ---------------------------------------------------------------------------
// Bridge helpers
// ---------------------------------------------------------------------------
let bridge;

async function openImage(path) {
  const buf = readFileSync(path);
  const r = await bridge.loadFile(buf, basename(path));
  if (!r.success) throw new Error("load failed: " + r.error);
}

async function run(script) {
  const r = await bridge.executeScript(script);
  if (!r.success) throw new Error("script failed: " + r.error);
  return r.data;
}

async function exportAs(fmt) {
  const r = await bridge.executeScript(
    `app.activeDocument.saveToOE('${fmt}');`,
    true
  );
  if (!r.success || !Buffer.isBuffer(r.data)) {
    throw new Error(`export ${fmt} failed: ${r.error || "no buffer"}`);
  }
  return r.data;
}

// Add a text layer, wait for Photopea's async font layout to settle, THEN
// flatten. Flattening before the web font lays out drops the text entirely.
async function addTextSettleFlatten(textScript) {
  await run(textScript); // adds a text layer; must NOT flatten inside
  await bridge.settleActiveLayer();
  await run("app.activeDocument.flatten();");
}

async function closeAll() {
  // Best-effort: close every open document without saving.
  await bridge.executeScript(
    "while(app.documents.length>0){app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);}"
  );
}

// Current active document pixel dimensions.
async function getDocSize() {
  const r = await bridge.executeScript(
    "app.echoToOE(app.activeDocument.width + 'x' + app.activeDocument.height);"
  );
  const [w, h] = String(r.data || "0x0").split("x").map(Number);
  return { w, h };
}

// Render a transparent text-overlay PNG (Pillow) sized w x h. Photopea cannot
// lay out text in headless Chromium, so text is rasterized externally and then
// composited inside Photopea.
function makeOverlay(name, w, h, items) {
  const spec = join(TMP, `${name}.json`);
  const png = join(TMP, `${name}_overlay.png`);
  writeFileSync(spec, JSON.stringify({ width: w, height: h, items }));
  execFileSync(PYTHON, [join(__dirname, "make_text_overlay.py"), spec, png]);
  return png;
}

// Load a full-canvas overlay PNG and composite it onto the (already active)
// base document, then flatten. Overlay and base must share dimensions so the
// centered paste aligns perfectly.
async function compositeOverlay(overlayPath) {
  const buf = readFileSync(overlayPath);
  const r = await bridge.loadFile(buf, basename(overlayPath));
  if (!r.success) throw new Error("overlay load failed: " + r.error);
  await run(`
    var ov=app.activeDocument;
    ov.selection.selectAll(); ov.selection.copy();
    ov.close(SaveOptions.DONOTSAVECHANGES);
    var base=app.activeDocument;
    base.paste();
    base.flatten();
  `);
}

// JSX snippet: fit current doc into tw x th, padded canvas, then flatten.
// NOTE: in Photopea, doc.width / doc.height are plain pixel NUMBERS (there is
// no UnitValue .value), so use them directly.
function jsxFitCanvas(tw, th) {
  return `
    var d=app.activeDocument;
    var s=Math.min(${tw}/d.width, ${th}/d.height);
    d.resizeImage(Math.max(1,Math.round(d.width*s)), Math.max(1,Math.round(d.height*s)));
    d.resizeCanvas(${tw}, ${th}, AnchorPosition.MIDDLECENTER);
    d.flatten();
  `;
}

// JSX snippet: add a text layer.
function jsxText(content, sizePx, hex, x, y, justify) {
  const c = JSON.stringify(content);
  return `
    var d=app.activeDocument;
    var L=d.artLayers.add(); L.kind=LayerKind.TEXT;
    var t=L.textItem; t.contents=${c};
    t.size=UnitValue(${sizePx},'px');
    var col=new SolidColor(); col.rgb.hexValue='${hex}';
    t.color=col;
    t.justification=Justification.${justify};
    t.position=[UnitValue(${x},'px'), UnitValue(${y},'px')];
  `;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
const SIZES = {
  "ig-square": [1080, 1080],
  "ig-story": [1080, 1920],
  "twitter": [1600, 900],
  "linkedin": [1200, 627],
};

const scenarios = [
  ["social-resize", async () => {
    const src = pick();
    const dir = outDir(1, "social-resize");
    const made = [];
    for (const [name, [w, h]] of Object.entries(SIZES)) {
      await openImage(src);
      await run(jsxFitCanvas(w, h));
      const png = await exportAs("png");
      const fp = join(dir, `${name}_${w}x${h}.png`);
      writeFileSync(fp, png);
      made.push(basename(fp));
      await closeAll();
    }
    return { src: basename(src), outputs: made };
  }],

  ["brand-color-variants", async () => {
    const src = pick();
    const dir = outDir(2, "brand-color-variants");
    const variants = { navy: "1a2a6c", crimson: "9b1b30", forest: "1e5631" };
    const made = [];
    for (const [name, hex] of Object.entries(variants)) {
      await openImage(src);
      await run(`
        var d=app.activeDocument;
        var L=d.artLayers.add(); L.blendMode=BlendMode.COLOR; L.opacity=70;
        d.activeLayer=L;
        d.selection.selectAll();
        var c=new SolidColor(); c.rgb.hexValue='${hex}';
        d.selection.fill(c); d.selection.deselect();
        d.flatten();
      `);
      const png = await exportAs("png");
      const fp = join(dir, `variant_${name}.png`);
      writeFileSync(fp, png);
      made.push(basename(fp));
      await closeAll();
    }
    return { src: basename(src), outputs: made };
  }],

  ["watermark", async () => {
    const src = pick();
    const dir = outDir(3, "watermark");
    await openImage(src);
    const { w, h } = await getDocSize();
    const ov = makeOverlay("watermark", w, h, [{
      text: "© BRAND STUDIO",
      x: w - Math.round(w * 0.02), y: h - Math.round(h * 0.03),
      size: Math.max(16, Math.round(w * 0.04)),
      color: "ffffff", anchor: "rd", opacity: 160, bold: true,
      stroke_width: Math.max(1, Math.round(w * 0.0015)), stroke_color: "000000",
    }]);
    await compositeOverlay(ov);
    const png = await exportAs("png");
    const fp = join(dir, "watermarked.png");
    writeFileSync(fp, png);
    await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["framed-mockup", async () => {
    const src = pick();
    const dir = outDir(4, "framed-mockup");
    await openImage(src);
    // Pad to a gray "studio" canvas with a white border around the artwork.
    await run(`
      var d=app.activeDocument;
      var bw=Math.round(d.width*0.06);
      d.resizeCanvas(d.width+bw*2, d.height+bw*2, AnchorPosition.MIDDLECENTER);
      var bg=d.artLayers.add(); bg.move(d, ElementPlacement.PLACEATEND);
      d.activeLayer=bg; d.selection.selectAll();
      var c=new SolidColor(); c.rgb.hexValue='ffffff'; d.selection.fill(c); d.selection.deselect();
      d.resizeCanvas(Math.round(d.width*1.25), Math.round(d.height*1.25), AnchorPosition.MIDDLECENTER);
      var bg2=d.artLayers.add(); bg2.move(d, ElementPlacement.PLACEATEND);
      d.activeLayer=bg2; d.selection.selectAll();
      var g=new SolidColor(); g.rgb.hexValue='e8e8ea'; d.selection.fill(g); d.selection.deselect();
      d.flatten();
    `);
    const png = await exportAs("png");
    const fp = join(dir, "framed.png");
    writeFileSync(fp, png);
    await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["psd-layer-cleanup", async () => {
    const src = pick();
    const dir = outDir(5, "psd-layer-cleanup");
    await openImage(src);
    await run(`
      var d=app.activeDocument;
      d.activeLayer.name='Background Artwork';
      var grp=d.layerSets.add(); grp.name='Delivery';
      d.activeLayer.move(grp, ElementPlacement.PLACEATEND);
    `);
    const psd = await exportAs("psd");
    const fp = join(dir, "cleaned.psd");
    writeFileSync(fp, psd);
    await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["localization", async () => {
    const src = pick();
    const dir = outDir(6, "localization");
    const langs = { TR: "YENİ SEZON", EN: "NEW SEASON", DE: "NEUE SAISON" };
    const made = [];
    for (const [code, text] of Object.entries(langs)) {
      await openImage(src);
      await run(jsxFitCanvas(1200, 628));
      const ov = makeOverlay(`loc_${code}`, 1200, 628, [{
        text, x: 600, y: 545, size: 84, color: "ffffff", anchor: "mm", bold: true,
        stroke_width: 3, stroke_color: "0a2540",
      }]);
      await compositeOverlay(ov);
      const png = await exportAs("png");
      const fp = join(dir, `banner_${code}.png`);
      writeFileSync(fp, png);
      made.push(basename(fp));
      await closeAll();
    }
    return { src: basename(src), outputs: made };
  }],

  ["auto-trim-transparent", async () => {
    const src = pick();
    const dir = outDir(7, "auto-trim-transparent");
    await openImage(src);
    // Trim uniform borders (auto-crop), then export transparent-capable PNG.
    await run(`
      var d=app.activeDocument;
      try { d.trim(TrimType.TOPLEFT, true, true, true, true); } catch(e){}
    `);
    const png = await exportAs("png");
    const fp = join(dir, "trimmed.png");
    writeFileSync(fp, png);
    await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["format-optimize", async () => {
    const src = pick();
    const dir = outDir(8, "format-optimize");
    await openImage(src);
    const made = [];
    for (const fmt of ["webp", "jpg"]) {
      const buf = await exportAs(fmt);
      const fp = join(dir, `optimized.${fmt}`);
      writeFileSync(fp, buf);
      made.push(`${basename(fp)} (${Math.round(buf.length / 1024)}KB)`);
    }
    await closeAll();
    return { src: basename(src), outputs: made };
  }],

  ["ad-set", async () => {
    const src = pick();
    const dir = outDir(9, "ad-set");
    const ads = [
      { cta: "SHOP NOW", w: 1080, h: 1080, hex: "ff3b30" },
      { cta: "50% OFF", w: 1200, h: 628, hex: "0a84ff" },
      { cta: "LIMITED", w: 1080, h: 1920, hex: "ffd60a" },
    ];
    const made = [];
    for (const a of ads) {
      await openImage(src);
      await run(jsxFitCanvas(a.w, a.h));
      const ov = makeOverlay(`ad_${a.cta.replace(/[^a-z0-9]+/gi, "_")}`, a.w, a.h, [{
        text: a.cta, x: Math.round(a.w / 2), y: Math.round(a.h * 0.85),
        size: Math.round(a.w * 0.09), color: a.hex, anchor: "mm", bold: true,
        stroke_width: Math.max(2, Math.round(a.w * 0.004)), stroke_color: "ffffff",
      }]);
      await compositeOverlay(ov);
      const png = await exportAs("png");
      const fp = join(dir, `ad_${a.cta.replace(/[^a-z0-9]+/gi, "_")}_${a.w}x${a.h}.png`);
      writeFileSync(fp, png);
      made.push(basename(fp));
      await closeAll();
    }
    return { src: basename(src), outputs: made };
  }],

  ["color-grade", async () => {
    const src = pick();
    const dir = outDir(10, "color-grade");
    await openImage(src);
    await run(`
      var d=app.activeDocument;
      var L=d.activeLayer;
      try { L.adjustBrightnessContrast(12, 18); } catch(e){}
      try { L.applySharpen(); } catch(e){}
      d.flatten();
    `);
    const png = await exportAs("png");
    const fp = join(dir, "graded.png");
    writeFileSync(fp, png);
    await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(OUTPUT, { recursive: true });
  const port = await findAvailablePort(4117);
  bridge = new PhotopeaBridge(port, createBrowserLauncher({ headless: true }));

  const frontendHtml = readFileSync(
    join(projectRoot, "src", "frontend", "index.html"),
    "utf-8"
  );
  bridge.getHttpServer().on("request", (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(frontendHtml);
    } else { res.writeHead(404); res.end(); }
  });

  await bridge.start();
  log(`headless bridge on :${port}, ${allImages.length} source images`);
  await bridge.waitForReady();
  log("Photopea ready");

  const summary = [];
  for (const [name, fn] of scenarios) {
    const t0 = Date.now();
    try {
      const r = await fn();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      log(`✅ ${name} (${secs}s) src=${r.src} -> ${r.outputs.length} file(s)`);
      summary.push({ name, status: "OK", src: r.src, outputs: r.outputs });
    } catch (e) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      log(`❌ ${name} (${secs}s): ${e.message}`);
      summary.push({ name, status: "FAIL", error: e.message });
      await closeAll().catch(() => {});
    }
  }

  writeFileSync(join(OUTPUT, "_manifest.json"), JSON.stringify(summary, null, 2));
  await bridge.stop();

  const ok = summary.filter((s) => s.status === "OK").length;
  log(`DONE: ${ok}/${scenarios.length} scenarios succeeded. Manifest -> Output/_manifest.json`);
  process.exit(ok === scenarios.length ? 0 : 2);
}

main().catch((e) => { console.error("[scen] fatal:", e); process.exit(1); });
