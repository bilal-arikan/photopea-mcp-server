import { describe, it, expect } from "vitest";
import {
  buildRemoveBackgroundRequest,
  buildInpaintRequest,
} from "../../src/ai/providers.js";
import { resolveAiKeys } from "../../src/ai/config.js";
import { buildMaskForRegion } from "../../src/bridge/script-builder.js";

const IMG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MASK = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("ai: background removal request", () => {
  it("targets the Dezgo endpoint with X-Dezgo-Key and image", () => {
    const req = buildRemoveBackgroundRequest(IMG, "K2");
    expect(req.url).toBe("https://api.dezgo.com/remove-background");
    expect(req.headers["X-Dezgo-Key"]).toBe("K2");
    expect(req.fields.find((f) => f.name === "image")?.filename).toBe("image.png");
  });
});

describe("ai: inpainting request", () => {
  it("builds a Dezgo inpaint request with init/mask/prompt", () => {
    const req = buildInpaintRequest(IMG, MASK, "a blue sky", "K", { seed: 7, negativePrompt: "blurry" });
    expect(req.url).toBe("https://api.dezgo.com/inpainting");
    expect(req.headers["X-Dezgo-Key"]).toBe("K");
    expect(req.fields.find((f) => f.name === "init_image")?.value).toBe(IMG);
    expect(req.fields.find((f) => f.name === "mask_image")?.value).toBe(MASK);
    expect(req.fields.find((f) => f.name === "prompt")?.value).toBe("a blue sky");
    expect(req.fields.find((f) => f.name === "seed")?.value).toBe("7");
    expect(req.fields.find((f) => f.name === "negative_prompt")?.value).toBe("blurry");
  });
});

describe("ai: key resolution", () => {
  it("prefers PHOTOPEA_MCP_DEZGO_KEY over DEZGO_API_KEY", () => {
    const keys = resolveAiKeys({ PHOTOPEA_MCP_DEZGO_KEY: "a", DEZGO_API_KEY: "b" } as NodeJS.ProcessEnv);
    expect(keys.dezgo).toBe("a");
  });

  it("falls back to DEZGO_API_KEY", () => {
    const keys = resolveAiKeys({ DEZGO_API_KEY: "b" } as NodeJS.ProcessEnv);
    expect(keys.dezgo).toBe("b");
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
