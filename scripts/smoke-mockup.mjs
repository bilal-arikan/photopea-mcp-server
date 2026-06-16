import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve, basename } from "path";
import { chromium } from "playwright";
import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { buildCreateDocument, buildExportImage } from "../dist/bridge/script-builder.js";
import { buildMockupReplace } from "../dist/bridge/script-builder-advanced.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root,"scripts","out"); mkdirSync(OUT,{recursive:true});
const bridge = new PhotopeaBridge(4146, async () => ({ close: async () => {} }));
const html = readFileSync(join(root,"src","frontend","index.html"),"utf-8");
bridge.getHttpServer().on("request",(q,s)=>{ if(q.method==="GET"&&(q.url==="/"||q.url==="/index.html")){s.writeHead(200,{"Content-Type":"text/html"});s.end(html);return;} s.writeHead(404);s.end(); });
await bridge.start();
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4146/",{waitUntil:"domcontentloaded"});
const t0=Date.now(); while(!bridge.isReady()&&Date.now()-t0<60000) await new Promise(r=>setTimeout(r,250));
const run=async(l,sc,f=false)=>{const r=await bridge.executeScript(sc,f);console.log(`[${l}] success=${r.success} ${r.success?"":("ERR="+r.error)}`);return r;};

// replacement image: green doc -> buffer
await bridge.executeScript(buildCreateDocument({width:200,height:200,resolution:72,name:"rep",mode:"RGB",fillColor:"#00cc44"}));
const rep = await bridge.executeScript(buildExportImage({format:"png"}), true);
const repBuf = rep.data;
await bridge.executeScript('try{app.activeDocument.close(2);}catch(e){}\n;app.echoToOE("ok");');

// template: dark bg + red placeholder rectangle layer named "screen"
await bridge.executeScript(buildCreateDocument({width:600,height:400,resolution:72,name:"tpl",mode:"RGB",fillColor:"#1a1a2e"}));
await run("placeholder", 'var L=app.activeDocument.artLayers.add(); L.name="screen"; var sc=new SolidColor();sc.rgb.red=220;sc.rgb.green=40;sc.rgb.blue=40; app.activeDocument.selection.select([[150,100],[450,100],[450,300],[150,300]]); app.activeDocument.selection.fill(sc); app.activeDocument.selection.deselect(); app.echoToOE("ok");');

// load replacement (becomes active), then composite into "screen"
const load = await bridge.loadFile(repBuf, "rep.png");
console.log("[loadRep] success="+load.success);
const composite = ['var _src=app.activeDocument;_src.selection.selectAll();_src.selection.copy(true);_src.close(2);', buildMockupReplace({targetLayer:"screen", fit:"fill", clip:true})].join("\n");
await run("mockup-composite", composite);
const exp = await run("export", buildExportImage({format:"png"}), true);
writeFileSync(join(OUT,"mockup.png"), exp.data);
const isPng = exp.data[0]===0x89 && exp.data[1]===0x50;
console.log("[RESULT] "+(exp.success&&isPng?"PASS ✅ bytes="+exp.data.length:"FAIL ❌"));
await browser.close(); await bridge.stop();
