import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve, basename, extname } from "path";
import { chromium } from "playwright";
import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { buildCreateDocument, buildExportImage } from "../dist/bridge/script-builder.js";
import { buildRotateCanvas } from "../dist/bridge/script-builder-advanced.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root,"scripts","out"); const IN = join(OUT,"batch-in"); const DST = join(OUT,"batch-out");
mkdirSync(IN,{recursive:true}); mkdirSync(DST,{recursive:true});
const bridge = new PhotopeaBridge(4144, async () => ({ close: async () => {} }));
const html = readFileSync(join(root,"src","frontend","index.html"),"utf-8");
bridge.getHttpServer().on("request",(q,s)=>{ if(q.method==="GET"&&(q.url==="/"||q.url==="/index.html")){s.writeHead(200,{"Content-Type":"text/html"});s.end(html);return;} s.writeHead(404);s.end(); });
await bridge.start();
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4144/",{waitUntil:"domcontentloaded"});
const t0=Date.now(); while(!bridge.isReady()&&Date.now()-t0<60000) await new Promise(r=>setTimeout(r,250));
// make two input files (different sizes), then close
for (const [name,w,h,col] of [["red",300,200,"#ff0000"],["blue",240,360,"#0000ff"]]) {
  await bridge.executeScript(buildCreateDocument({width:w,height:h,resolution:72,name,mode:"RGB",fillColor:col}));
  const e = await bridge.executeScript(buildExportImage({format:"png"}), true);
  writeFileSync(join(IN,name+".png"), e.data);
  await bridge.executeScript('try{app.activeDocument.close(2);}catch(e){}\n;app.echoToOE("ok");');
}
console.log("[setup] 2 input files written");
// BATCH: for each input -> load -> rotate 90 -> export -> save -> close
const sources = [join(IN,"red.png"), join(IN,"blue.png")];
const results = [];
for (const src of sources) {
  let ok=false, out=null, err=null;
  try {
    const data = readFileSync(src);
    const load = await bridge.loadFile(data, basename(src));
    if(!load.success) throw new Error(load.error||"open fail");
    const ran = await bridge.executeScript(buildRotateCanvas(90)+"\n;app.echoToOE('ok');");
    if(!ran.success) throw new Error(ran.error||"script fail");
    const exp = await bridge.executeScript(buildExportImage({format:"png"}), true);
    if(!exp.success) throw new Error(exp.error||"export fail");
    out = join(DST, basename(src, extname(src))+"_rot.png");
    writeFileSync(out, exp.data);
    ok = exp.data[0]===0x89 && exp.data[1]===0x50;
  } catch(e){ err=e.message; } finally {
    await bridge.executeScript('try{app.activeDocument.close(2);}catch(e){}\n;app.echoToOE("ok");');
  }
  results.push({src:basename(src),ok,out:out?basename(out):null,err});
  console.log(`[batch] ${basename(src)} ok=${ok} out=${out?basename(out):null} ${err||""}`);
}
const allOk = results.every(r=>r.ok) && existsSync(join(DST,"red_rot.png")) && existsSync(join(DST,"blue_rot.png"));
console.log("[RESULT] "+(allOk?"PASS ✅ (2 files loaded, rotated, exported, saved)":"FAIL ❌"));
await browser.close(); await bridge.stop();
if(!allOk) process.exit(1);
