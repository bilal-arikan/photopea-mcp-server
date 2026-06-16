import { describe, it, expect } from "vitest";
import {
  buildCrop,
  buildTrim,
  buildRotateCanvas,
  buildAddLayerMask,
  buildApplyLayerMask,
  buildDeleteLayerMask,
  buildAddAdjustmentLayer,
  buildMockupReplace,
  buildSetClippingMask,
  buildMergeLayers,
  buildIsolateTopLayer,
  buildMagicWandSelect,
  buildReplaceColor,
} from "../../src/bridge/script-builder-advanced.js";
import { resolveTimeouts } from "../../src/bridge/timeouts.js";

describe("advanced: canvas ops", () => {
  it("buildCrop converts x/y/w/h to a bounds array", () => {
    expect(buildCrop({ x: 10, y: 20, width: 100, height: 50 })).toContain("crop([10, 20, 110, 70])");
  });
  it("buildTrim maps basis to TrimType", () => {
    expect(buildTrim("transparent")).toContain("TrimType.TRANSPARENT");
    expect(buildTrim("topLeft")).toContain("TrimType.TOP_LEFT");
    expect(buildTrim("bottomRight")).toContain("TrimType.BOTTOM_RIGHT");
  });
  it("buildRotateCanvas emits rotateCanvas", () => {
    expect(buildRotateCanvas(90)).toContain("rotateCanvas(90)");
  });
});

describe("advanced: layer masks (AM)", () => {
  it("add mask uses a binding-safe charIDToTypeID wrapper (no raw alias)", () => {
    const s = buildAddLayerMask("all");
    expect(s).toContain("function(x){return app.charIDToTypeID(x);}");
    expect(s).not.toContain("var _c = app.charIDToTypeID;");
    expect(s).toContain("'RvlA'");
  });
  it("hide-all mask uses HdAl", () => {
    expect(buildAddLayerMask("none")).toContain("'HdAl'");
  });
  it("apply mask sets Aply true; delete mask does not", () => {
    expect(buildApplyLayerMask()).toContain("putBoolean(_c('Aply'), true)");
    expect(buildDeleteLayerMask()).not.toContain("Aply");
  });
});

describe("advanced: adjustment layers (AM)", () => {
  it("brightness sets brightness/contrast integers", () => {
    const s = buildAddAdjustmentLayer({ type: "brightness", settings: { brightness: 40, contrast: 20 } });
    expect(s).toContain("_c('BrgC')");
    expect(s).toContain("putInteger(_s('brightness'), 40)");
    expect(s).toContain("putInteger(_s('contrast'), 20)");
  });
  it("hue_sat builds a master adjustment list", () => {
    const s = buildAddAdjustmentLayer({ type: "hue_sat", settings: { hue: 30, saturation: -20, lightness: 10 } });
    expect(s).toContain("hueSaturation");
    expect(s).toContain("putInteger(_s('hue'), 30)");
    expect(s).toContain("putInteger(_s('saturation'), -20)");
  });
  it("levels creates with presetKindDefault then sets composite input/gamma", () => {
    const s = buildAddAdjustmentLayer({ type: "levels", settings: { inputMin: 20, inputMax: 235, gamma: 1.3 } });
    expect(s).toContain("presetKindDefault");
    expect(s).toContain("_c('Lvls')");
    expect(s).toContain("putInteger(20)");
    expect(s).toContain("putInteger(235)");
    expect(s).toContain("putDouble(_c('Gmm '), 1.3)");
    // must define its own binding-safe wrappers
    expect(s).toContain("function(x){return app.charIDToTypeID(x);}");
  });
});

describe("advanced: clipping / merge / isolate", () => {
  it("clipping mask sets grouped on the target", () => {
    expect(buildSetClippingMask("photo", true)).toContain("_layer.grouped = true");
    expect(buildSetClippingMask(2, false)).toContain("_layer.grouped = false");
    expect(buildSetClippingMask(2, false)).toContain("layers[2]");
  });
  it("merge maps modes to the right Photopea calls", () => {
    expect(buildMergeLayers("flatten")).toContain("flatten()");
    expect(buildMergeLayers("visible")).toContain("mergeVisibleLayers()");
    expect(buildMergeLayers("down")).toContain("activeLayer.merge()");
  });
  it("isolate shows only the given top-level index", () => {
    expect(buildIsolateTopLayer(3)).toContain("(_k === 3)");
  });
});

describe("advanced: magic wand / replace color", () => {
  it("magic wand sets the selection channel to a point with tolerance", () => {
    const s = buildMagicWandSelect(50, 60, 40, true);
    expect(s).toContain("putProperty(_c('Chnl'), _c('fsel'))");
    expect(s).toContain("_c('#Pxl'), 50");
    expect(s).toContain("_c('#Pxl'), 60");
    expect(s).toContain("putInteger(_c('Tlrn'), 40)");
    expect(s).toContain("putBoolean(_c('AntA'), true)");
  });
  it("replace color selects then fills with the given rgb and deselects", () => {
    const s = buildReplaceColor(10, 20, { r: 0, g: 204, b: 0 }, 25);
    expect(s).toContain("putInteger(_c('Tlrn'), 25)");
    expect(s).toContain("_fc.rgb.red = 0; _fc.rgb.green = 204; _fc.rgb.blue = 0;");
    expect(s).toContain("selection.fill(_fc)");
    expect(s).toContain("selection.deselect()");
  });
});

describe("advanced: timeouts config", () => {
  it("uses defaults when env is empty", () => {
    const t = resolveTimeouts({} as NodeJS.ProcessEnv);
    expect(t.DEFAULT_TIMEOUT_MS).toBe(30000);
    expect(t.EXPORT_TIMEOUT_MS).toBe(60000);
  });
  it("honors env overrides", () => {
    const t = resolveTimeouts({ PHOTOPEA_MCP_TIMEOUT_MS: "5000", PHOTOPEA_MCP_EXPORT_TIMEOUT_MS: "12000" } as unknown as NodeJS.ProcessEnv);
    expect(t.DEFAULT_TIMEOUT_MS).toBe(5000);
    expect(t.EXPORT_TIMEOUT_MS).toBe(12000);
  });
  it("ignores invalid values", () => {
    const t = resolveTimeouts({ PHOTOPEA_MCP_TIMEOUT_MS: "abc" } as unknown as NodeJS.ProcessEnv);
    expect(t.DEFAULT_TIMEOUT_MS).toBe(30000);
  });
});

describe("advanced: mockup replace", () => {
  it("fill uses Math.max scaling and finds the target layer recursively (nested groups)", () => {
    const s = buildMockupReplace({ targetLayer: "screen", fit: "fill", clip: true });
    expect(s).toContain("_find(_tpl.layers, 'screen')");
    expect(s).toContain("function _find(coll, nm)");
    expect(s).toContain("Math.max(_pw / _lw, _ph2 / _lh)");
    expect(s).toContain("_l.grouped = true");
    expect(s).toContain("PLACEBEFORE");
  });
  it("fit uses Math.min scaling; clip=false omits grouping", () => {
    const s = buildMockupReplace({ targetLayer: "art", fit: "fit", clip: false });
    expect(s).toContain("Math.min(_pw / _lw, _ph2 / _lh)");
    expect(s).not.toContain("_l.grouped = true");
  });
  it("escapes the layer name", () => {
    const s = buildMockupReplace({ targetLayer: "a'b" });
    expect(s).toContain("a\\'b");
  });
});
