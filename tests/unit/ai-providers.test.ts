import { describe, it, expect } from "vitest";
import {
  buildRemoveBackgroundRequest,
  buildInpaintRequest,
  selectBgProvider,
} from "../../src/ai/providers.js";
import { resolveAiKeys } from "../../src/ai/config.js";
import { buildMaskForRegion } from "../../src/bridge/script-builder.js";

const IMG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MASK = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("ai: background removal request", () => {
  it("removebg targets remove.bg with X-Api-Key and image_file", () => {
    const req = buildRemoveBackgroundRequest("removebg", IMG, "K1");
    expect(req.url).toBe("https://api.remove.bg/v1.0/removebg");
    expect(req.headers["X-Api-Key"]).toBe("K1");
    expect(req.fields.find((f) => f.name === "image_file")?.value).toBe(IMG);
  });

  it("dezgo targets the Dezgo endpoint with X-Dezgo-Key and image", () => {
    const req = buildRemoveBackgroundRequest("dezgo", IMG, "K2");
    expect(req.url).toBe("https://api.dezgo.com/remove-background");
    expect(req.headers["X-Dezgo-Key"]).toBe("K2");
    expect(req.fields.find((f) => f.name === "image")?.filename).toBe("image.png");
  });
});

describe("ai: inpainting request", () => {
  it("builds a Dezgo inpaint request with init/mask/prompt", () => {
    const req = buildInpaintRequest("dezgo", IMG, MASK, "a blue sky", "K", { seed: 7, negativePrompt: "blurry" });
    expect(req.url).toBe("https://api.dezgo.com/inpainting");
    expect(req.headers["X-Dezgo-Key"]).toBe("K");
    expect(req.fields.find((f) => f.name === "init_image")?.value).toBe(IMG);
    expect(req.fields.find((f) => f.name === "mask_image")?.value).toBe(MASK);
    expect(req.fields.find((f) => f.name === "prompt")?.value).toBe("a blue sky");
    expect(req.fields.find((f) => f.name === "seed")?.value).toBe("7");
    expect(req.fields.find((f) => f.name === "negative_prompt")?.value).toBe("blurry");
  });
});

describe("ai: provider selection", () => {
  it("auto prefers remove.bg when its key exists", () => {
    const sel = selectBgProvider("auto", { removebg: "R", dezgo: "D" });
    expect(sel.provider).toBe("removebg");
    expect(sel.key).toBe("R");
  });

  it("auto falls back to dezgo when only dezgo key exists", () => {
    const sel = selectBgProvider("auto", { dezgo: "D" });
    expect(sel.provider).toBe("dezgo");
  });

  it("throws a helpful error when no key is configured", () => {
    expect(() => selectBgProvider("auto", {})).toThrow(/No background-removal API key/);
  });

  it("explicit provider without its key throws", () => {
    expect(() => selectBgProvider("removebg", { dezgo: "D" })).toThrow(/remove\.bg requires/);
  });
});

describe("ai: key resolution", () => {
  it("prefers PHOTOPEA_MCP_* over generic names", () => {
    const keys = resolveAiKeys({ PHOTOPEA_MCP_DEZGO_KEY: "a", DEZGO_API_KEY: "b", REMOVEBG_API_KEY: "c" } as NodeJS.ProcessEnv);
    expect(keys.dezgo).toBe("a");
    expect(keys.removebg).toBe("c");
  });
});

describe("ai: mask builder", () => {
  it("paints a white region on black and exports png from a temp doc", () => {
    const script = buildMaskForRegion({ x: 10, y: 20, width: 100, height: 50 });
    expect(script).toContain("documents.add");
    expect(script).toContain("[[10,20],[110,20],[110,70],[10,70]]");
    expect(script).toContain("saveToOE('png')");
    expect(script).toContain("_mask.close(2)");
  });
});
