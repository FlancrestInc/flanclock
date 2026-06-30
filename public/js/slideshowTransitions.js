export const PHOTO_TRANSITION_TYPES = [
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
];

const DIRECTIONS = ["left", "right", "up", "down"];
const INTENSITIES = ["subtle", "normal", "dramatic"];
const CONCRETE_TRANSITION_TYPES = PHOTO_TRANSITION_TYPES.filter((type) => type !== "random");

export function concreteTransitionTypes() {
  return [...CONCRETE_TRANSITION_TYPES];
}

export function selectConcreteTransition(type, previousType = "", randomFn = Math.random) {
  if (type !== "random") return CONCRETE_TRANSITION_TYPES.includes(type) ? type : "crossfade";
  const choices = CONCRETE_TRANSITION_TYPES.filter((candidate) => candidate !== previousType);
  const pool = choices.length ? choices : CONCRETE_TRANSITION_TYPES;
  return pool[Math.floor(randomFn() * pool.length)] || "crossfade";
}

export function resolvePhotoTransition(settings = {}, options = {}) {
  const prefersReducedMotion = Boolean(options.reducedMotion);
  const selectedType = selectConcreteTransition(settings.transitionType || "crossfade", options.previousType, options.randomFn);
  const type = prefersReducedMotion ? "crossfade" : selectedType;
  const direction = resolveDirection(settings.transitionDirection || "random", options.randomFn);
  const intensity = INTENSITIES.includes(settings.transitionIntensity) ? settings.transitionIntensity : "normal";
  const durationMs = clampInt(settings.transitionDurationMs, 900, 250, 3000);

  return {
    type,
    durationMs: prefersReducedMotion ? Math.min(durationMs, 450) : durationMs,
    direction,
    intensity,
    kenBurns: Boolean(settings.enableKenBurns) || type === "ken-burns-fade"
  };
}

export function preloadImage(url, warn = console.warn) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    image.onload = () => finish(resolve, image);
    image.onerror = () => {
      const error = new Error(`Failed to load slideshow photo: ${url}`);
      warn(error.message);
      finish(reject, error);
    };
    image.src = url;
    if (image.decode) {
      image.decode().then(() => finish(resolve, image)).catch(() => {});
    }
  });
}

export function transitionCssVars(transition, randomFn = Math.random) {
  const distance = transition.intensity === "dramatic" ? 1.12 : transition.intensity === "subtle" ? 0.82 : 1;
  const zoom = transition.intensity === "dramatic" ? 1.12 : transition.intensity === "subtle" ? 1.035 : 1.07;
  const rotation = transition.intensity === "dramatic" ? 88 : transition.intensity === "subtle" ? 42 : 64;
  const blur = transition.intensity === "dramatic" ? 5 : transition.intensity === "subtle" ? 1.5 : 3;
  const pan = randomFn() > 0.5 ? 1 : -1;

  return {
    "--photo-transition-duration": `${transition.durationMs}ms`,
    "--slide-x": `${slideVector(transition.direction).x * distance * 100}%`,
    "--slide-y": `${slideVector(transition.direction).y * distance * 100}%`,
    "--cube-rotation": `${rotation}deg`,
    "--wipe-softness": transition.intensity === "dramatic" ? "8%" : transition.intensity === "subtle" ? "2%" : "5%",
    "--glitch-blur": `${blur}px`,
    "--ken-start": "scale(1.02) translate3d(0, 0, 0)",
    "--ken-end": `scale(${zoom}) translate3d(${pan * 1.6}%, ${pan * -1.1}%, 0)`,
    "--ken-next-start": `scale(${zoom}) translate3d(${pan * -1.4}%, ${pan * 1.2}%, 0)`,
    "--ken-next-end": "scale(1.03) translate3d(0, 0, 0)"
  };
}

function resolveDirection(direction, randomFn = Math.random) {
  if (DIRECTIONS.includes(direction)) return direction;
  return DIRECTIONS[Math.floor(randomFn() * DIRECTIONS.length)] || "left";
}

function slideVector(direction) {
  return {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 }
  }[direction] || { x: -1, y: 0 };
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
