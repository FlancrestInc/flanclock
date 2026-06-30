import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/server/defaultConfig.js";
import { validateConfig } from "../src/server/validation.js";

describe("photo transition config validation", () => {
  test("default config enables Ken Burns and uses random 900ms transitions", () => {
    const config = validateConfig(DEFAULT_CONFIG);

    expect(config.face.photo.transitionType).toBe("random");
    expect(config.face.photo.transitionDurationMs).toBe(900);
    expect(config.face.photo.transitionDirection).toBe("random");
    expect(config.face.photo.transitionIntensity).toBe("normal");
    expect(config.face.photo.enableKenBurns).toBe(true);
  });

  test("accepts every starter transition type and rejects invalid duration ranges", () => {
    for (const transitionType of [
      "crossfade",
      "dip-to-black",
      "slide",
      "push",
      "ken-burns-fade",
      "clock-wipe",
      "iris-wipe",
      "star-wipe",
      "cube-rotate",
      "vhs-glitch",
      "random"
    ]) {
      expect(validateConfig({ ...DEFAULT_CONFIG, face: { ...DEFAULT_CONFIG.face, photo: { ...DEFAULT_CONFIG.face.photo, transitionType } } }).face.photo.transitionType).toBe(transitionType);
    }

    expect(() =>
      validateConfig({
        ...DEFAULT_CONFIG,
        face: { ...DEFAULT_CONFIG.face, photo: { ...DEFAULT_CONFIG.face.photo, transitionDurationMs: 249 } }
      })
    ).toThrow();
    expect(() =>
      validateConfig({
        ...DEFAULT_CONFIG,
        face: { ...DEFAULT_CONFIG.face, photo: { ...DEFAULT_CONFIG.face.photo, transitionDurationMs: 3001 } }
      })
    ).toThrow();
  });
});
