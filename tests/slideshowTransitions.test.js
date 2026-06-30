import { describe, expect, test, vi } from "vitest";
import {
  PHOTO_TRANSITION_TYPES,
  concreteTransitionTypes,
  preloadImage,
  resolvePhotoTransition,
  selectConcreteTransition
} from "../public/js/slideshowTransitions.js";

describe("photo slideshow transition helpers", () => {
  test("lists the starter transition set without making random concrete", () => {
    expect(PHOTO_TRANSITION_TYPES).toEqual([
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
    ]);
    expect(concreteTransitionTypes()).not.toContain("random");
  });

  test("random transition selection does not recurse and avoids repeating when possible", () => {
    const pickLast = vi.fn(() => 0.99);

    expect(selectConcreteTransition("random", "vhs-glitch", pickLast)).toBe("cube-rotate");
    expect(selectConcreteTransition("random", "crossfade", () => 0)).toBe("dip-to-black");
  });

  test("reduced motion falls back animated transitions to crossfade", () => {
    expect(resolvePhotoTransition({ transitionType: "cube-rotate" }, { reducedMotion: true }).type).toBe("crossfade");
    expect(resolvePhotoTransition({ transitionType: "dip-to-black" }, { reducedMotion: true }).type).toBe("crossfade");
  });

  test("preloadImage rejects failed image loads with the image URL", async () => {
    const warnings = [];
    globalThis.Image = class {
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onerror(new Error("boom")));
      }
    };

    await expect(preloadImage("/bad-photo.jpg", (message) => warnings.push(message))).rejects.toThrow("/bad-photo.jpg");
    expect(warnings[0]).toContain("/bad-photo.jpg");
  });
});
