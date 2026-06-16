import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { chromium } from "playwright";
import { PhotopeaBridge } from "../dist/bridge/websocket-server.js";
import { buildCreateDocument, buildAddLayer, buildApplyAdjustment, buildAddGradient, buildExportImage } from "../dist/bridge/script-builder.js";
import { buildAddAdjustmentLayer, buildSetClippingMask, buildMergeLayers, buildIsolateTopLayer } from "../dist/bridge/script-builder-advanced.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT=join(root,"scripts","out"); mkdirSync(OUT,{recursive:true});
const bridge = new PhotopeaBridge(4149, async () => ({ close: async () => {} }));
const html = readFileSync(join(root,"src","frontend","index.html"),"utf-8");
bridge.getHttpServer().on("request",(q,s)=>{ if(q.method==="GET"&&(q.url==="/"||q.url==="/index.html")){s.writeHead(200,{"Content-Type":"text/html"});s.end(html);return;} s.writeHead(404);s.end(); });
await bridge.start();
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4149/",{waitUntil:"domcontentloaded"});
const t0=Date.now(); while(!bridge.isReady()&&Date.now()-t0<60000) await new Promise(r=>setTimeout(r,250));
const close=async()=>{await bridge.executeScript('try{while(app.documents.length>0)app.activeDocument.close(2);}catch(e){}\n;app.echoToOE("ok");');};
const run=async(l,sc)=>{const r=await bridge.executeScript(sc);console.log(`[${l}] success=${r.success} ${r.success?(r.data?("data="+JSON.stringify(r.data)):""):("ERR="+r.error)}`);return r;};
const layers=async()=>{const r=await bridge.executeScript('app.echoToOE(""+app.activeDocument.layers.length);');return r.data;};

// gradient linear
await close(); await bridge.executeScript(buildCreateDocument({width:300,height:200,resolution:72,name:"GL",mode:"RGB",fillColor:"#000000"}));
await run("addLayer", buildAddLayer({name:"g"}));
await run("gradient-linear", buildAddGradient({target:"g", type:"linear", colors:["#ff0000","#0000ff"], angle:45}));
let e=await bridge.executeScript(buildExportImage({format:"png"}),true); writeFileSync(join(OUT,"grad-linear.png"),e.data); console.log("  saved grad-linear "+e.data.length+"b");

// gradient radial
await close(); await bridge.executeScript(buildCreateDocument({width:300,height:200,resolution:72,name:"GR",mode:"RGB",fillColor:"#000000"}));
await run("addLayer", buildAddLayer({name:"g"}));
await run("gradient-radial", buildAddGradient({target:"g", type:"radial", colors:["#ffff00","#ff0088"]}));
e=await bridge.executeScript(buildExportImage({format:"png"}),true); writeFileSync(join(OUT,"grad-radial.png"),e.data); console.log("  saved grad-radial "+e.data.length+"b");

// destructive hue_sat (AM fix)
await close(); await bridge.executeScript(buildCreateDocument({width:200,height:150,resolution:72,name:"HS",mode:"RGB",fillColor:"#cc4400"}));
await run("hue_sat-destructive", buildApplyAdjustment({type:"hue_sat", settings:{hue:120, saturation:0, lightness:0}}));

// levels adjustment layer with values
await close(); await bridge.executeScript(buildCreateDocument({width:200,height:150,resolution:72,name:"LV",mode:"RGB",fillColor:"#808080"}));
console.log("  before adj layers="+await layers());
await run("levels-adjLayer", buildAddAdjustmentLayer({type:"levels", settings:{inputMin:20, inputMax:235, gamma:1.3}}));
console.log("  after adj layers="+await layers());

// clipping mask
await close(); await bridge.executeScript(buildCreateDocument({width:200,height:150,resolution:72,name:"CM",mode:"RGB",fillColor:"#222222"}));
await run("base-layer", buildAddLayer({name:"base"}));
await run("top-layer", buildAddLayer({name:"top"}));
await run("clip", buildSetClippingMask("top", true));

// merge visible
await run("merge-visible", buildMergeLayers("visible"));
console.log("  after merge layers="+await layers());

// isolate top layer
await close(); await bridge.executeScript(buildCreateDocument({width:200,height:150,resolution:72,name:"IS",mode:"RGB",fillColor:"#114488"}));
await run("addL2", buildAddLayer({name:"L2"}));
await run("isolate-0", buildIsolateTopLayer(0));

await browser.close(); await bridge.stop();
console.log("[DONE]");
