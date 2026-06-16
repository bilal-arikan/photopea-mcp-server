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
} from "../../src/bridge/script-builder-advanced.js";

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
});

describe("advanced: mockup replace", () => {
  it("fill uses Math.max scaling and looks up the target layer by name", () => {
    const s = buildMockupReplace({ targetLayer: "screen", fit: "fill", clip: true });
    expect(s).toContain("getByName('screen')");
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
