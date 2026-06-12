// scripts/harder-scenarios.mjs
// 10 advanced design tasks via the headless Photopea bridge (+ Pillow overlays).
//   node scripts/harder-scenarios.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { createBrowserLauncher } from "../dist/browser/launcher.js";
import { findAvailablePort } from "../dist/utils/platform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const IMAGES = "C:/Users/Bilal/Desktop/Projects/photopea-test/Images";
const OUTPUT = "C:/Users/Bilal/Desktop/Projects/photopea-test/Output2";
const TMP = "C:/Users/Bilal/Desktop/Projects/photopea-test/.tmp2";
const PYTHON = "C:/Python313/python.exe";
mkdirSync(TMP, { recursive: true });
mkdirSync(OUTPUT, { recursive: true });

const log = (...a) => console.log("[hard]", ...a);
let _seed = 98765;
const rnd = () => ((_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const allImages = readdirSync(IMAGES).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const pick = () => join(IMAGES, allImages[Math.floor(rnd() * allImages.length)]);
const pickN = (n) => Array.from({ length: n }, pick);
function outDir(n, name) { const d = join(OUTPUT, `${String(n).padStart(2, "0")}_${name}`); mkdirSync(d, { recursive: true }); return d; }

let bridge;
const run = async (s) => { const r = await bridge.executeScript(s); if (!r.success) throw new Error("script: " + r.error); return r.data; };
async function openImage(p) { const r = await bridge.loadFile(readFileSync(p), basename(p)); if (!r.success) throw new Error("load: " + r.error); }
async function exportAs(fmt) { const r = await bridge.executeScript(`app.activeDocument.saveToOE('${fmt}');`, true); if (!r.success || !Buffer.isBuffer(r.data)) throw new Error("export " + fmt + ": " + r.error); return r.data; }
const closeAll = () => bridge.executeScript("while(app.documents.length>0){app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);}");
async function getDocSize() { const r = await bridge.executeScript("app.echoToOE(app.activeDocument.width+'x'+app.activeDocument.height);"); const [w, h] = String(r.data || "0x0").split("x").map(Number); return { w, h }; }

const jsxFit = (tw, th) => `var d=app.activeDocument;var s=Math.min(${tw}/d.width,${th}/d.height);d.resizeImage(Math.max(1,Math.round(d.width*s)),Math.max(1,Math.round(d.height*s)));d.resizeCanvas(${tw},${th},AnchorPosition.MIDDLECENTER);d.flatten();`;
const jsxCover = (tw, th) => `var d=app.activeDocument;var s=Math.max(${tw}/d.width,${th}/d.height);d.resizeImage(Math.max(1,Math.round(d.width*s)),Math.max(1,Math.round(d.height*s)));d.resizeCanvas(${tw},${th},AnchorPosition.MIDDLECENTER);d.flatten();`;
const jsxTint = (hex, op) => `var d=app.activeDocument;var L=d.artLayers.add();L.blendMode=BlendMode.COLOR;L.opacity=${op};d.activeLayer=L;d.selection.selectAll();var c=new SolidColor();c.rgb.hexValue='${hex}';d.selection.fill(c);d.selection.deselect();d.flatten();`;

function newDoc(w, h, hex) {
  return run(`var d=app.documents.add(${w},${h},72);d.selection.selectAll();var c=new SolidColor();c.rgb.hexValue='${hex}';d.selection.fill(c);d.selection.deselect();app.echoToOE('ok');`);
}

function makeOverlay(name, w, h, items) {
  const spec = join(TMP, `${name}.json`); const png = join(TMP, `${name}.png`);
  writeFileSync(spec, JSON.stringify({ width: w, height: h, items }));
  execFileSync(PYTHON, [join(__dirname, "make_overlay.py"), spec, png]);
  return png;
}
async function compositeOverlay(path) {
  await bridge.loadFile(readFileSync(path), basename(path));
  await run("var ov=app.activeDocument;ov.selection.selectAll();ov.selection.copy();ov.close(SaveOptions.DONOTSAVECHANGES);var base=app.activeDocument;base.paste();base.flatten();");
}
// Paste an image file into the active master doc at (cx,cy) after cover-fitting to cellW×cellH.
async function pasteInto(masterW, masterH, path, cellW, cellH, cx, cy, tintHex, tintOp) {
  await openImage(path);
  await run(jsxCover(cellW, cellH));
  if (tintHex) await run(jsxTint(tintHex, tintOp ?? 65));
  await run("var d=app.activeDocument;d.selection.selectAll();d.selection.copy();d.close(SaveOptions.DONOTSAVECHANGES);");
  const dx = Math.round(cx - masterW / 2), dy = Math.round(cy - masterH / 2);
  await run(`var base=app.activeDocument;var L=base.paste();L.translate(${dx},${dy});`);
}
const py = (script, args) => execFileSync(PYTHON, [join(__dirname, script), ...args]);

// Ellipse polygon points (for vignette selection).
function ellipsePts(cx, cy, rx, ry, n = 48) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))]); }
  return JSON.stringify(p);
}

const tasks = [
  ["contact-sheet", async () => {
    const imgs = pickN(9); const dir = outDir(1, "contact-sheet");
    const W = 1200, H = 1200, cell = 400;
    await newDoc(W, H, "111418");
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
      await pasteInto(W, H, imgs[i], cell - 12, cell - 12, cx, cy);
    }
    await run("app.activeDocument.flatten();");
    const fp = join(dir, "contact_sheet.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { outputs: [basename(fp)] };
  }],

  ["warhol-popart", async () => {
    const src = pick(); const dir = outDir(2, "warhol-popart");
    const W = 1000, H = 1000, cell = 500;
    const tints = ["ff2d55", "0a84ff", "ffd60a", "30d158"];
    await newDoc(W, H, "ffffff");
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let k = 0; k < 4; k++) {
      const [c, r] = cells[k];
      await pasteInto(W, H, src, cell, cell, c * cell + cell / 2, r * cell + cell / 2, tints[k], 75);
    }
    await run("app.activeDocument.flatten();");
    const fp = join(dir, "warhol.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["duotone-poster", async () => {
    const src = pick(); const dir = outDir(3, "duotone-poster");
    await openImage(src);
    await run(jsxCover(1080, 1350));
    await run("var d=app.activeDocument;d.activeLayer.desaturate();try{d.activeLayer.adjustBrightnessContrast(0,40);}catch(e){}");
    await run(jsxTint("2d2a7a", 80)); // duotone tint
    const ov = makeOverlay("duo", 1080, 1350, [
      { type: "roundrect", x: 0, y: 1180, w: 1080, h: 170, radius: 0, color: "0a0a23", opacity: 200 },
      { type: "text", text: "MIDNIGHT", x: 540, y: 1240, size: 96, color: "ffd60a", anchor: "mm", bold: true },
      { type: "text", text: "a duotone study", x: 540, y: 1310, size: 36, color: "ffffff", anchor: "mm" },
    ]);
    await compositeOverlay(ov);
    const fp = join(dir, "duotone.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["cinematic-vignette", async () => {
    const src = pick(); const dir = outDir(4, "cinematic-vignette");
    await openImage(src);
    await run(jsxCover(1600, 900));
    await run("var d=app.activeDocument;try{d.activeLayer.applyAddNoise(6,NoiseDistribution.GAUSSIAN,true);}catch(e){}");
    await run(`var d=app.activeDocument;var v=d.artLayers.add();d.activeLayer=v;d.selection.select(${ellipsePts(800, 450, 760, 470)},SelectionType.REPLACE,160,false);d.selection.invert();var c=new SolidColor();c.rgb.hexValue='000000';d.selection.fill(c,ColorBlendMode.NORMAL,62);d.selection.deselect();d.flatten();`);
    const fp = join(dir, "vignette.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["polaroid", async () => {
    const src = pick(); const dir = outDir(5, "polaroid");
    await openImage(src);
    await run(jsxCover(820, 820));
    const { w, h } = await getDocSize();
    await run(`var d=app.activeDocument;d.resizeCanvas(${w + 120},${h + 320},AnchorPosition.MIDDLECENTER);var bg=d.artLayers.add();bg.move(d,ElementPlacement.PLACEATEND);d.activeLayer=bg;d.selection.selectAll();var c=new SolidColor();c.rgb.hexValue='f7f5f0';d.selection.fill(c);d.selection.deselect();d.flatten();`);
    // The image sits centered; shift up so bottom margin is bigger
    const ov = makeOverlay("pola", w + 120, h + 320, [
      { type: "text", text: "summer '26", x: (w + 120) / 2, y: h + 230, size: 54, color: "2b2b2b", anchor: "mm", bold: false },
    ]);
    await compositeOverlay(ov);
    const fp = join(dir, "polaroid.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["before-after", async () => {
    const [a, b] = pickN(2); const dir = outDir(6, "before-after");
    const W = 1600, H = 900;
    await newDoc(W, H, "000000");
    await pasteInto(W, H, a, 800, 900, 400, 450);
    await pasteInto(W, H, b, 800, 900, 1200, 450);
    await run("app.activeDocument.flatten();");
    const ov = makeOverlay("ba", W, H, [
      { type: "line", x0: 800, y0: 0, x1: 800, y1: 900, width: 6, color: "ffffff" },
      { type: "roundrect", x: 40, y: 800, w: 260, h: 64, radius: 12, color: "000000", opacity: 150 },
      { type: "roundrect", x: 1300, y: 800, w: 260, h: 64, radius: 12, color: "000000", opacity: 150 },
      { type: "text", text: "BEFORE", x: 170, y: 832, size: 40, color: "ffffff", anchor: "mm", bold: true },
      { type: "text", text: "AFTER", x: 1430, y: 832, size: 40, color: "30d158", anchor: "mm", bold: true },
    ]);
    await compositeOverlay(ov);
    const fp = join(dir, "before_after.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: `${basename(a)} | ${basename(b)}`, outputs: [basename(fp)] };
  }],

  ["circular-avatar", async () => {
    const src = pick(); const dir = outDir(7, "circular-avatar");
    await openImage(src); await run(jsxCover(512, 512));
    const tmpBase = join(TMP, "avatar_base.png"); writeFileSync(tmpBase, await exportAs("png")); await closeAll();
    const fp = join(dir, "avatar.png");
    py("make_circle.py", [tmpBase, fp, "0a84ff", "20"]);
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["tiled-watermark", async () => {
    const src = pick(); const dir = outDir(8, "tiled-watermark");
    await openImage(src); const { w, h } = await getDocSize();
    const ov = makeOverlay("tile", w, h, [
      { type: "tiled_text", text: "© SAMPLE — DO NOT COPY", size: Math.max(22, Math.round(w * 0.022)), color: "ffffff", opacity: 38, angle: -30, stepx: Math.round(w * 0.42), stepy: Math.round(h * 0.16) },
    ]);
    await compositeOverlay(ov);
    const fp = join(dir, "tiled_wm.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["youtube-thumb", async () => {
    const src = pick(); const dir = outDir(9, "youtube-thumb");
    await openImage(src); await run(jsxCover(1280, 720));
    await run("var d=app.activeDocument;try{d.activeLayer.adjustBrightnessContrast(15,35);}catch(e){}");
    const ov = makeOverlay("yt", 1280, 720, [
      { type: "vgradient", color: "000000", a0: 0, a1: 200, y0: 460, y1: 720 },
      { type: "roundrect", x: 60, y: 60, w: 250, h: 88, radius: 16, color: "ff2d55", opacity: 255 },
      { type: "text", text: "NEW!", x: 185, y: 104, size: 56, color: "ffffff", anchor: "mm", bold: true },
      { type: "text", text: "I BUILT THIS", x: 60, y: 600, size: 96, color: "ffd60a", anchor: "lm", bold: true, stroke_width: 6, stroke_color: "000000" },
      { type: "text", text: "in headless Photopea", x: 64, y: 668, size: 40, color: "ffffff", anchor: "lm", bold: true, stroke_width: 3, stroke_color: "000000" },
    ]);
    await compositeOverlay(ov);
    const fp = join(dir, "thumbnail.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],

  ["spotlight-card", async () => {
    const src = pick(); const dir = outDir(10, "spotlight-card");
    const W = 1200, H = 800;
    // Blurred background
    await openImage(src); await run(jsxCover(W, H));
    await run("var d=app.activeDocument;try{d.activeLayer.applyGaussianBlur(28);}catch(e){}try{d.activeLayer.adjustBrightnessContrast(-30,0);}catch(e){}");
    // White card + soft shadow overlay
    const cardX = 300, cardY = 175, cardW = 600, cardH = 450;
    const shadow = [];
    for (let k = 6; k >= 1; k--) shadow.push({ type: "roundrect", x: cardX - k * 3, y: cardY - k * 3 + 10, w: cardW + k * 6, h: cardH + k * 6, radius: 28, color: "000000", opacity: 14 });
    const ov = makeOverlay("card", W, H, [
      ...shadow,
      { type: "roundrect", x: cardX, y: cardY, w: cardW, h: cardH, radius: 24, color: "ffffff", opacity: 255 },
    ]);
    await compositeOverlay(ov);
    // Sharp inset photo on the card
    await pasteInto(W, H, src, cardW - 60, cardH - 130, W / 2, cardY + (cardH - 130) / 2 + 30);
    await run("app.activeDocument.flatten();");
    const ov2 = makeOverlay("card2", W, H, [
      { type: "text", text: "SPOTLIGHT", x: W / 2, y: cardY + cardH - 40, size: 44, color: "111418", anchor: "mm", bold: true },
    ]);
    await compositeOverlay(ov2);
    const fp = join(dir, "spotlight.png"); writeFileSync(fp, await exportAs("png")); await closeAll();
    return { src: basename(src), outputs: [basename(fp)] };
  }],
];

async function main() {
  const port = await findAvailablePort(4117);
  bridge = new PhotopeaBridge(port, createBrowserLauncher({ headless: true }));
  const html = readFileSync(join(projectRoot, "src", "frontend", "index.html"), "utf-8");
  bridge.getHttpServer().on("request", (req, res) => {
    if (req.url === "/" || req.url === "/index.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); }
    else { res.writeHead(404); res.end(); }
  });
  await bridge.start();
  log(`headless bridge :${port}, ${allImages.length} images`);
  await bridge.waitForReady();
  log("ready");

  const summary = [];
  for (const [name, fn] of tasks) {
    const t0 = Date.now();
    try {
      const r = await fn();
      log(`OK ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s) -> ${r.outputs.join(", ")}`);
      summary.push({ name, status: "OK", ...r });
    } catch (e) {
      log(`FAIL ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s): ${e.message}`);
      summary.push({ name, status: "FAIL", error: e.message });
      await closeAll().catch(() => {});
    }
  }
  writeFileSync(join(OUTPUT, "_manifest.json"), JSON.stringify(summary, null, 2));
  await bridge.stop();
  const ok = summary.filter((s) => s.status === "OK").length;
  log(`DONE ${ok}/${tasks.length}`);
  process.exit(ok === tasks.length ? 0 : 2);
}
main().catch((e) => { console.error("[hard] fatal:", e); process.exit(1); });
