import fs from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete globalThis.document;
  delete globalThis.fetch;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: undefined
  });
});

function setupAdminDom() {
  const fields = [
    { name: "weather.enabled", type: "checkbox", checked: false },
    { name: "weather.locationLabel", type: "text", value: "" },
    { name: "weather.latitude", type: "number", value: "" },
    { name: "weather.longitude", type: "number", value: "" },
    { name: "weather.units", type: "select-one", value: "fahrenheit" },
    { name: "weather.cacheTtlMinutes", type: "number", value: "20" },
    { name: "face.photo.immichServerUrl", type: "url", value: "https://immich.example" },
    { name: "face.photo.immichAlbumId", type: "text", value: "album-1" },
    { name: "face.photo.icloudUrl", type: "url", value: "" },
    { name: "providers.immich.apiKey", type: "password", value: "" },
    { name: "admin.password", type: "password", value: "" }
  ];
  const elements = new Map([
    ["#saveStatus", { textContent: "" }],
    ["#weatherStatus", { textContent: "" }],
    ["#photoStatus", { textContent: "" }]
  ]);
  const handlers = new Map();
  const form = {
    querySelectorAll: (selector) => (selector === "[name]" ? fields : []),
    addEventListener: (event, handler) => handlers.set(`form:${event}`, handler)
  };
  elements.set("#configForm", form);

  for (const selector of ['[data-test="weather"]', '[data-test="weather-location"]', '[data-test="icloud"]', '[data-test="immich"]']) {
    elements.set(selector, {
      disabled: false,
      addEventListener: (event, handler) => handlers.set(`${selector}:${event}`, handler)
    });
  }

  globalThis.document = {
    querySelector: (selector) => elements.get(selector)
  };
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      weather: {
        enabled: false,
        locationLabel: "Denver, CO",
        latitude: 39.7392,
        longitude: -104.9903,
        units: "fahrenheit",
        cacheTtlMinutes: 20
      }
    })
  }));

  return { elements, fields, handlers };
}

test("detects browser location and fills weather latitude and longitude", async () => {
  const { fields, handlers, elements } = setupAdminDom();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: vi.fn((success) =>
          success({
            coords: {
              latitude: 40.015,
              longitude: -105.2705
            }
          })
        )
      }
    }
  });

  await import("../public/js/admin.js");
  await handlers.get('[data-test="weather-location"]:click')();

  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
    enableHighAccuracy: true,
    maximumAge: 300000,
    timeout: 10000
  });
  expect(fields.find((field) => field.name === "weather.latitude").value).toBe("40.0150");
  expect(fields.find((field) => field.name === "weather.longitude").value).toBe("-105.2705");
  expect(elements.get("#weatherStatus").textContent).toBe("Location detected. Save configuration to keep it.");
});

test("reports when browser location detection is unavailable", async () => {
  const { handlers, elements } = setupAdminDom();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {}
  });

  await import("../public/js/admin.js");
  await handlers.get('[data-test="weather-location"]:click')();

  expect(elements.get("#weatherStatus").textContent).toBe("Location detection is not available in this browser.");
});

test("sends entered Immich API key when testing Immich", async () => {
  const { fields, handlers } = setupAdminDom();
  fields.find((field) => field.name === "providers.immich.apiKey").value = "secret-key";

  await import("../public/js/admin.js");
  await handlers.get('[data-test="immich"]:click')();

  expect(globalThis.fetch).toHaveBeenLastCalledWith("/api/test/immich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providers: {
        immich: {
          serverUrl: "https://immich.example",
          albumId: "album-1",
          apiKey: "secret-key"
        }
      }
    })
  });
});

test("shows only configuration fields relevant to the selected face and photo source", async () => {
  const handlers = new Map();
  const fields = [
    { name: "face.type", type: "select-one", value: "modern", addEventListener: (event, handler) => handlers.set("face.type", handler) },
    { name: "face.photo.source", type: "select-one", value: "icloud", addEventListener: (event, handler) => handlers.set("face.photo.source", handler) }
  ];
  const conditionals = [
    { dataset: { showWhen: "face.type:modern" }, hidden: false },
    { dataset: { showWhen: "face.type:photo" }, hidden: false },
    { dataset: { showWhen: "face.photo.source:icloud" }, hidden: false },
    { dataset: { showWhen: "face.photo.source:immich" }, hidden: false }
  ];
  const form = {
    querySelectorAll: (selector) => {
      if (selector === "[name]") return fields;
      if (selector === "[data-show-when]") return conditionals;
      return [];
    },
    addEventListener: vi.fn()
  };
  const elements = new Map([
    ["#configForm", form],
    ["#saveStatus", { textContent: "" }],
    ["#weatherStatus", { textContent: "" }],
    ["#photoStatus", { textContent: "" }]
  ]);
  for (const selector of ['[data-test="weather"]', '[data-test="weather-location"]', '[data-test="icloud"]', '[data-test="immich"]']) {
    elements.set(selector, { disabled: false, addEventListener: vi.fn() });
  }
  globalThis.document = { querySelector: (selector) => elements.get(selector) };
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      face: {
        type: "modern",
        photo: { source: "icloud" }
      }
    })
  }));

  await import("../public/js/admin.js");
  await vi.waitFor(() => expect(conditionals[0].hidden).toBe(false));

  expect(conditionals.map((element) => element.hidden)).toEqual([false, true, false, true]);

  fields[0].value = "photo";
  fields[1].value = "immich";
  handlers.get("face.type")();
  handlers.get("face.photo.source")();

  expect(conditionals.map((element) => element.hidden)).toEqual([true, false, true, false]);
});

test("does not offer clock face density in the admin page", async () => {
  const html = await fs.readFile(new URL("../public/admin.html", import.meta.url), "utf8");

  expect(html).not.toContain('name="face.modern.density"');
  expect(html).not.toContain(">Density<");
});
