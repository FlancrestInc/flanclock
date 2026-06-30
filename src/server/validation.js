import { z } from "zod";
import { IANAZone } from "luxon";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const safeUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL");

const photoTransitionType = z.enum([
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

export const configSchema = z.object({
  admin: z
    .object({
      passwordHash: z.string(),
      passwordChangedAt: z.string().nullable()
    })
    .optional(),
  display: z.object({
    timezone: z.string().min(1).max(80).refine((value) => IANAZone.isValidZone(value), "Must be a valid IANA timezone"),
    hourMode: z.enum(["12", "24"]),
    showSeconds: z.boolean(),
    showDate: z.boolean(),
    dateFormat: z.string().min(1).max(80),
    datePosition: z.enum(["above", "below", "left", "right"]),
    brightness: z.object({
      enabled: z.boolean(),
      dimStart: z.string().regex(/^\d{2}:\d{2}$/),
      dimEnd: z.string().regex(/^\d{2}:\d{2}$/),
      dimOpacity: z.number().min(0.1).max(1)
    })
  }),
  face: z.object({
    type: z.enum(["sevenSegment", "nixie", "modern", "photo"]),
    theme: z.enum(["red", "green", "amber", "blue", "white"]),
    modern: z.object({
      font: z.enum(["systemSans", "systemSerif", "monospace", "rounded"]),
      fontScale: z.number().min(0.6).max(1.6),
      color: hexColor,
      backgroundColor: hexColor,
      density: z.enum(["compact", "comfortable", "spacious"])
    }),
    photo: z.object({
      source: z.enum(["local", "icloud", "immich"]),
      localFolder: z.string().min(1).max(500),
      icloudUrl: safeUrl,
      immichServerUrl: safeUrl,
      immichAlbumId: z.string().max(200),
      rotationIntervalSeconds: z.number().int().min(5).max(3600),
      transitionType: photoTransitionType,
      transitionDurationMs: z.number().int().min(250).max(3000),
      transitionDirection: z.enum(["left", "right", "up", "down", "random"]),
      transitionIntensity: z.enum(["subtle", "normal", "dramatic"]),
      enableKenBurns: z.boolean(),
      overlayPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
      overlayOpacity: z.number().min(0).max(1),
      showDate: z.boolean(),
      showWeather: z.boolean()
    })
  }),
  weather: z.object({
    enabled: z.boolean(),
    provider: z.enum(["openMeteo"]),
    locationLabel: z.string().max(120),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    units: z.enum(["fahrenheit", "celsius"]),
    cacheTtlMinutes: z.number().int().min(5).max(180)
  }),
  providers: z.object({
    immich: z.object({
      serverUrl: safeUrl,
      albumId: z.string().max(200),
      apiKey: z.string().max(500)
    }),
    icloud: z.object({
      publicAlbumUrl: safeUrl
    })
  })
});

export function validateConfig(input) {
  return configSchema.parse(input);
}
