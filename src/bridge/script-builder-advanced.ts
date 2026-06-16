// src/bridge/script-builder-advanced.ts
import { escapeString } from "./script-builder.js";
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

/**
 * Crop the canvas to a target aspect ratio (width:height). Keeps the largest
 * centered rectangle of that ratio that fits the current canvas — i.e. a
 * center crop that trims the excess on the longer axis. Computed at runtime
 * from the live document dimensions.
 */
export function buildCropAspect(ratioW: number, ratioH: number): string {
  return [
    `var _d = app.activeDocument;`,
    `var _W = (typeof _d.width === 'object' && _d.width !== null) ? _d.width.value : _d.width;`,
    `var _H = (typeof _d.height === 'object' && _d.height !== null) ? _d.height.value : _d.height;`,
    `var _target = ${ratioW} / ${ratioH};`,
    `var _cur = _W / _H;`,
    `var _cw, _ch;`,
    `if (_cur > _target) { _ch = _H; _cw = Math.round(_H * _target); } else { _cw = _W; _ch = Math.round(_W / _target); }`,
    `var _x = Math.round((_W - _cw) / 2), _y = Math.round((_H - _ch) / 2);`,
    `_d.crop([_x, _y, _x + _cw, _y + _ch]);`,
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

export type AdjustmentLayerType = "brightness" | "hue_sat" | "levels";

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
    case "levels": {
      // Levels needs a presetKindDefault hint on creation, otherwise the make
      // opens a modal dialog and hangs in headless. Create default, then set the
      // composite-channel input/gamma values.
      const inB = settings.inputMin ?? 0;
      const inW = settings.inputMax ?? 255;
      const gamma = settings.gamma ?? 1;
      lines.push(
        [
          `var _c = function(x){return app.charIDToTypeID(x);};`,
          `var _s = function(x){return app.stringIDToTypeID(x);};`,
          `var _mk = new ActionDescriptor();`,
          `var _mr = new ActionReference();`,
          `_mr.putClass(_c('AdjL'));`,
          `_mk.putReference(_c('null'), _mr);`,
          `var _using = new ActionDescriptor();`,
          `var _tp = new ActionDescriptor();`,
          `_tp.putEnumerated(_s('presetKind'), _s('presetKindType'), _s('presetKindDefault'));`,
          `_using.putObject(_c('Type'), _c('Lvls'), _tp);`,
          `_mk.putObject(_c('Usng'), _c('AdjL'), _using);`,
          `app.executeAction(_c('Mk  '), _mk, DialogModes.NO);`,
        ].join("\n")
      );
      lines.push(
        setTarget("_c('Lvls')", [
          `var _adjL = new ActionList();`,
          `var _adj = new ActionDescriptor();`,
          `var _chRef = new ActionReference();`,
          `_chRef.putEnumerated(_c('Chnl'), _c('Chnl'), _c('Cmps'));`,
          `_adj.putReference(_c('Chnl'), _chRef);`,
          `var _inL = new ActionList(); _inL.putInteger(${Math.round(inB)}); _inL.putInteger(${Math.round(inW)});`,
          `_adj.putList(_c('Inpt'), _inL);`,
          `_adj.putDouble(_c('Gmm '), ${gamma});`,
          `_adjL.putObject(_s('levelsAdjustment'), _adj);`,
          `_t.putList(_s('adjustment'), _adjL);`,
        ].join("\n"))
      );
      break;
    }
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Magic wand selection / replace color
// ---------------------------------------------------------------------------

/**
 * Emit a magic-wand selection at (x, y) with the given tolerance. Implemented as
 * a "set the selection channel to a point" Action-Manager call — Photopea's
 * colorRange event hangs in headless, but this point-based magic wand works.
 * The selection is contiguous (the connected region of similar pixels).
 */
function magicWandLines(x: number, y: number, tolerance: number, antiAlias: boolean): string[] {
  return [
    `var _c = function(k){return app.charIDToTypeID(k);};`,
    `var _wd = new ActionDescriptor();`,
    `var _wr = new ActionReference();`,
    `_wr.putProperty(_c('Chnl'), _c('fsel'));`,
    `_wd.putReference(_c('null'), _wr);`,
    `var _pt = new ActionDescriptor();`,
    `_pt.putUnitDouble(_c('Hrzn'), _c('#Pxl'), ${x});`,
    `_pt.putUnitDouble(_c('Vrtc'), _c('#Pxl'), ${y});`,
    `_wd.putObject(_c('T   '), _c('Pnt '), _pt);`,
    `_wd.putInteger(_c('Tlrn'), ${Math.round(tolerance)});`,
    `_wd.putBoolean(_c('AntA'), ${antiAlias ? "true" : "false"});`,
    `app.executeAction(_c('setd'), _wd, DialogModes.NO);`,
  ];
}

export function buildMagicWandSelect(
  x: number,
  y: number,
  tolerance = 32,
  antiAlias = true
): string {
  return [...magicWandLines(x, y, tolerance, antiAlias), `app.echoToOE('ok');`].join("\n");
}

/** Magic-wand select the region at (x, y) and fill it with a new color. */
export function buildReplaceColor(
  x: number,
  y: number,
  color: { r: number; g: number; b: number },
  tolerance = 32
): string {
  return [
    ...magicWandLines(x, y, tolerance, true),
    `var _fc = new SolidColor();`,
    `_fc.rgb.red = ${color.r}; _fc.rgb.green = ${color.g}; _fc.rgb.blue = ${color.b};`,
    `app.activeDocument.selection.fill(_fc);`,
    `app.activeDocument.selection.deselect();`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Clipping mask
// ---------------------------------------------------------------------------

/**
 * Clip (or unclip) a layer to the layer directly below it. A clipped layer is
 * only visible where the layer below has pixels — the non-destructive way to
 * confine content (textures, photos) to a shape.
 */
export function buildSetClippingMask(target: string | number, enabled: boolean): string {
  return [
    `var _layer = ${layerRefAdv(target)};`,
    `app.activeDocument.activeLayer = _layer;`,
    `_layer.grouped = ${enabled ? "true" : "false"};`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Merge / flatten
// ---------------------------------------------------------------------------

export type MergeMode = "flatten" | "visible" | "down";

/** Flatten the whole document, merge all visible layers, or merge the active layer down. */
export function buildMergeLayers(mode: MergeMode): string {
  let op: string;
  switch (mode) {
    case "flatten":
      op = `app.activeDocument.flatten();`;
      break;
    case "visible":
      op = `app.activeDocument.mergeVisibleLayers();`;
      break;
    case "down":
    default:
      op = `app.activeDocument.activeLayer.merge();`;
      break;
  }
  return [op, `app.echoToOE('ok');`].join("\n");
}

/** Show only the top-level layer at `index`, hiding the rest (for per-layer export). */
export function buildIsolateTopLayer(index: number): string {
  return [
    `var _ls = app.activeDocument.layers;`,
    `for (var _k = 0; _k < _ls.length; _k++) { _ls[_k].visible = (_k === ${index}); }`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

/** Restore every top-level layer to visible. */
export function buildShowAllTopLayers(): string {
  return [
    `var _ls = app.activeDocument.layers;`,
    `for (var _k = 0; _k < _ls.length; _k++) { _ls[_k].visible = true; }`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

// Local layer reference (string name = top-level getByName, number = index).
function layerRefAdv(target: string | number): string {
  if (typeof target === "number") return `app.activeDocument.layers[${target}]`;
  return `app.activeDocument.layers.getByName('${escapeString(target)}')`;
}

// ---------------------------------------------------------------------------
// Mockup: replace a named placeholder layer's content with a pasted image
// ---------------------------------------------------------------------------

export interface MockupReplaceParams {
  /** Name of the placeholder layer in the template to replace. */
  targetLayer: string;
  /** "fill" covers the whole placeholder (may crop); "fit" shows the whole image. */
  fit?: "fill" | "fit";
  /** Clip the pasted image to the placeholder (recommended for "fill"). */
  clip?: boolean;
}

/**
 * Composite the clipboard image (a just-copied replacement) into a template's
 * named placeholder layer, scaled to the placeholder's bounds. Runs AFTER the
 * replacement document has been copied (selectAll + copy) and closed, so the
 * template is the active document and the image is on the clipboard.
 *
 * Note: this is a pragmatic mockup workflow for axis-aligned placeholders.
 * Photopea cannot replace true smart-object contents in headless mode (the
 * action opens a modal dialog), so we fit-and-clip a pasted layer instead — no
 * perspective warp.
 */
export function buildMockupReplace(params: MockupReplaceParams): string {
  const { targetLayer, fit = "fill", clip = true } = params;
  const name = escapeString(targetLayer);
  const op = fit === "fit" ? "Math.min" : "Math.max";
  return [
    `function _bv(v){ return (typeof v === 'object' && v !== null) ? (v.value || v.L || 0) : v; }`,
    // Recursive layer lookup so placeholders nested inside groups are found too.
    `function _find(coll, nm){ for (var i = 0; i < coll.length; i++){ var L = coll[i]; if (L.name === nm) return L; if (L.layers && L.layers.length){ var r = _find(L.layers, nm); if (r) return r; } } return null; }`,
    `var _tpl = app.activeDocument;`,
    `var _ph = _find(_tpl.layers, '${name}');`,
    `if (!_ph) { throw new Error("placeholder layer not found: ${name}"); }`,
    `_tpl.activeLayer = _ph;`,
    `var _pb = _ph.bounds;`,
    `var _px = _bv(_pb[0]), _py = _bv(_pb[1]);`,
    `var _pw = _bv(_pb[2]) - _px, _ph2 = _bv(_pb[3]) - _py;`,
    // Paste the clipboard image as a new layer.
    `_tpl.paste();`,
    `var _l = _tpl.activeLayer;`,
    `var _lb = _l.bounds;`,
    `var _lw = _bv(_lb[2]) - _bv(_lb[0]), _lh = _bv(_lb[3]) - _bv(_lb[1]);`,
    `var _scale = ${op}(_pw / _lw, _ph2 / _lh);`,
    `if (_lw > 0 && _lh > 0) { _l.resize(_scale * 100, _scale * 100); }`,
    // Center the scaled layer over the placeholder.
    `var _lb2 = _l.bounds;`,
    `var _nlw = _bv(_lb2[2]) - _bv(_lb2[0]), _nlh = _bv(_lb2[3]) - _bv(_lb2[1]);`,
    `_l.translate((_px + _pw / 2) - (_bv(_lb2[0]) + _nlw / 2), (_py + _ph2 / 2) - (_bv(_lb2[1]) + _nlh / 2));`,
    `_l.name = '${name} (replaced)';`,
    // Place the new layer directly above the placeholder.
    `_l.move(_ph, ElementPlacement.PLACEBEFORE);`,
    // Clip to the placeholder so overflow is hidden (best-effort).
    clip ? `try { _l.grouped = true; } catch (e) {}` : `// no clipping`,
    `app.echoToOE('ok');`,
  ].join("\n");
}
