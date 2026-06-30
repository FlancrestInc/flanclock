import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs/promises";

const RealDate = globalThis.Date;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  globalThis.Date = RealDate;
  delete globalThis.document;
  delete globalThis.fetch;
  delete globalThis.EventSource;
});

test("renders weekday names without date token replacement corrupting them", async () => {
  const elements = new Map();
  const element = () => ({
    className: "",
    dataset: {},
    innerHTML: "",
    style: {
      setProperty: vi.fn()
    }
  });
  elements.set("#clock", element());
  elements.set("#face", element());
  elements.set("#photoStage", element());

  globalThis.document = {
    querySelector: (selector) => elements.get(selector)
  };
  globalThis.EventSource = class {
    addEventListener() {}
  };
  globalThis.fetch = vi.fn(async (url) => ({
    ok: true,
    json: async () => {
      if (url === "/api/config") {
        return {
          display: {
            timezone: "America/Denver",
            hourMode: "12",
            showSeconds: true,
            showDate: true,
            dateFormat: "cccc",
            datePosition: "below",
            brightness: { enabled: false }
          },
          face: {
            type: "sevenSegment",
            theme: "red",
            modern: { color: "#fff", backgroundColor: "#000", fontScale: 1, density: "comfortable", font: "systemSans" },
            photo: { overlayOpacity: 0.62 }
          },
          weather: { enabled: false }
        };
      }
      return { status: "error" };
    }
  }));
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) return super(...args);
      return new RealDate("2026-06-29T12:00:00Z");
    }
  };
  globalThis.Date.UTC = RealDate.UTC;
  globalThis.Date.parse = RealDate.parse;
  globalThis.Date.now = () => new RealDate("2026-06-29T12:00:00Z").getTime();

  await import("../public/js/display.js");
  await vi.waitFor(() => {
    expect(elements.get("#face").innerHTML).toContain("Monday");
  });
  expect(elements.get("#face").innerHTML).not.toContain("6on29ay");
});

test("keeps the seven-segment time row below the 800px display cap", async () => {
  const css = await fs.readFile(new URL("../public/css/display.css", import.meta.url), "utf8");
  const sevenTimeRule = css.match(/\.seven-time\s*\{(?<body>[^}]+)\}/)?.groups?.body || "";

  expect(sevenTimeRule).toMatch(/max-width:\s*(?:min\([^;]*800px|7[0-9]{2}px)/);
});

test("uses Raspberry Pi OS Lite default font families for display faces", async () => {
  const css = await fs.readFile(new URL("../public/css/display.css", import.meta.url), "utf8");

  expect(css).toContain('"DejaVu Sans", sans-serif');
  expect(css).toContain('"DejaVu Serif", serif');
  expect(css).toContain('"DejaVu Sans Mono", monospace');
  expect(css).not.toMatch(/-apple-system|BlinkMacSystemFont|Segoe UI|Courier New|Times New Roman|SFMono|Consolas|Trebuchet MS|Arial Rounded/i);
});

test("admin labels only offer Raspberry Pi OS Lite-safe font choices", async () => {
  const html = await fs.readFile(new URL("../public/admin.html", import.meta.url), "utf8");

  expect(html).toContain("DejaVu Sans");
  expect(html).toContain("DejaVu Serif");
  expect(html).toContain("DejaVu Sans Mono");
  expect(html).not.toMatch(/>[^<]*(Rounded|geometric|System sans|System serif)[^<]*</i);
});
