// src/bridge/script-builder-advanced.ts
// Builders for advanced, non-destructive operations: canvas crop/trim/rotate,
// layer masks, and adjustment layers. Layer masks and adjustment layers are
// created through Photopea's Action Manager (executeAction), which mirrors the
// Photoshop scripting AM API. All AM identifiers are resolved via
// app.charIDToTypeID / app.stringIDToTypeID at runtime.

// ---------------------------------------------------------------------------
// Canvas operations
// ---------------------------------------------------------------------------

export interface CropParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildCrop(params: CropParams): string {
  const { x, y, width, height } = params;
  return [
    `app.activeDocument.crop([${x}, ${y}, ${x + width}, ${y + height}]);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export type TrimBasis = "transparent" | "topLeft" | "bottomRight";

export function buildTrim(basis: TrimBasis = "transparent"): string {
  const trimType =
    basis === "topLeft"
      ? "TrimType.TOP_LEFT"
      : basis === "bottomRight"
      ? "TrimType.BOTTOM_RIGHT"
      : "TrimType.TRANSPARENT";
  return [
    `app.activeDocument.trim(${trimType}, true, true, true, true);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildRotateCanvas(degrees: number): string {
  return [
    `app.activeDocument.rotateCanvas(${degrees});`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Layer masks (Action Manager)
// ---------------------------------------------------------------------------

export type MaskReveal = "all" | "none";

/** Add a pixel layer mask to the active layer (reveal-all white, or hide-all black). */
export function buildAddLayerMask(reveal: MaskReveal = "all"): string {
  const revealId = reveal === "none" ? "'HdAl'" : "'RvlA'";
  return [
    `var _c = function(x){return app.charIDToTypeID(x);};`,
    `var _d = new ActionDescriptor();`,
    `_d.putClass(_c('Nw  '), _c('Chnl'));`,
    `var _r = new ActionReference();`,
    `_r.putEnumerated(_c('Chnl'), _c('Chnl'), _c('Msk '));`,
    `_d.putReference(_c('At  '), _r);`,
    `_d.putEnumerated(_c('Usng'), _c('UsrM'), _c(${revealId}));`,
    `app.executeAction(_c('Mk  '), _d, DialogModes.NO);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

/** Apply (bake) the active layer's mask into its pixels and remove the mask. */
export function buildApplyLayerMask(): string {
  return [
    `var _c = function(x){return app.charIDToTypeID(x);};`,
    `var _d = new ActionDescriptor();`,
    `var _r = new ActionReference();`,
    `_r.putEnumerated(_c('Chnl'), _c('Ordn'), _c('Trgt'));`,
    `_d.putReference(_c('null'), _r);`,
    `_d.putBoolean(_c('Aply'), true);`,
    `app.executeAction(_c('Dlt '), _d, DialogModes.NO);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

/** Delete the active layer's mask without applying it. */
export function buildDeleteLayerMask(): string {
  return [
    `var _c = function(x){return app.charIDToTypeID(x);};`,
    `var _d = new ActionDescriptor();`,
    `var _r = new ActionReference();`,
    `_r.putEnumerated(_c('Chnl'), _c('Chnl'), _c('Msk '));`,
    `_d.putReference(_c('null'), _r);`,
    `app.executeAction(_c('Dlt '), _d, DialogModes.NO);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Adjustment layers (Action Manager) — non-destructive
// ---------------------------------------------------------------------------

export type AdjustmentLayerType = "brightness" | "hue_sat";

export interface AdjustmentLayerParams {
  type: AdjustmentLayerType;
  settings?: Record<string, number>;
}

/**
 * Create a non-destructive adjustment layer above the active layer. The layer
 * is created empty (default values) and then its values are set via a follow-up
 * `set` action so the change is editable later, unlike the destructive
 * apply_adjustment tool which writes directly to pixels.
 */
export function buildAddAdjustmentLayer(params: AdjustmentLayerParams): string {
  const { type, settings = {} } = params;

  // Common preamble: make an adjustment layer of the given AM "type" class.
  const make = (typeClass: string): string =>
    [
      `var _c = function(x){return app.charIDToTypeID(x);};`,
      `var _s = function(x){return app.stringIDToTypeID(x);};`,
      `var _mk = new ActionDescriptor();`,
      `var _mr = new ActionReference();`,
      `_mr.putClass(_c('AdjL'));`,
      `_mk.putReference(_c('null'), _mr);`,
      `var _using = new ActionDescriptor();`,
      `_using.putObject(_c('Type'), ${typeClass}, new ActionDescriptor());`,
      `_mk.putObject(_c('Usng'), _c('AdjL'), _using);`,
      `app.executeAction(_c('Mk  '), _mk, DialogModes.NO);`,
    ].join("\n");

  // `set` the active (just-created) adjustment layer's parameters.
  const setTarget = (typeClass: string, body: string): string =>
    [
      `var _setd = new ActionDescriptor();`,
      `var _sr = new ActionReference();`,
      `_sr.putEnumerated(_c('AdjL'), _c('Ordn'), _c('Trgt'));`,
      `_setd.putReference(_c('null'), _sr);`,
      `var _t = new ActionDescriptor();`,
      body,
      `_setd.putObject(_c('T   '), ${typeClass}, _t);`,
      `app.executeAction(_c('setd'), _setd, DialogModes.NO);`,
    ].join("\n");

  const lines: string[] = [];

  switch (type) {
    case "brightness": {
      const b = settings.brightness ?? 0;
      const c = settings.contrast ?? 0;
      lines.push(make("_c('BrgC')"));
      lines.push(
        setTarget("_c('BrgC')", [
          `_t.putInteger(_s('brightness'), ${Math.round(b)});`,
          `_t.putInteger(_s('contrast'), ${Math.round(c)});`,
          `_t.putBoolean(_s('useLegacy'), false);`,
        ].join("\n"))
      );
      break;
    }
    case "hue_sat": {
      const h = settings.hue ?? 0;
      const s = settings.saturation ?? 0;
      const l = settings.lightness ?? 0;
      lines.push(make("_s('hueSaturation')"));
      // hueSaturation uses an adjustment list with a single "master" entry.
      lines.push(
        setTarget("_s('hueSaturation')", [
          `_t.putBoolean(_s('colorize'), false);`,
          `var _adjL = new ActionList();`,
          `var _adj = new ActionDescriptor();`,
          `_adj.putInteger(_s('hue'), ${Math.round(h)});`,
          `_adj.putInteger(_s('saturation'), ${Math.round(s)});`,
          `_adj.putInteger(_s('lightness'), ${Math.round(l)});`,
          `_adjL.putObject(_s('hueSatAdjustmentV2'), _adj);`,
          `_t.putList(_s('adjustment'), _adjL);`,
        ].join("\n"))
      );
      break;
    }
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}
