import { expect, test } from "vitest";
import { PhotoService } from "../src/server/photos.js";

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get: (name) => options.headers?.[name] || options.headers?.[name.toLowerCase()] || null
    },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

test("lists iCloud shared album photos through the sharedstreams API", async () => {
  const calls = [];
  const service = new PhotoService({
    localPhotoDir: "/tmp/photos",
    cacheDir: "/tmp/cache",
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (url === "https://p23-sharedstreams.icloud.com/B1vG6XBubGftwum/sharedstreams/webstream") {
        return jsonResponse({ "X-Apple-MMe-Host": "p119-sharedstreams.icloud.com" }, { ok: false, status: 330 });
      }
      if (url === "https://p119-sharedstreams.icloud.com/B1vG6XBubGftwum/sharedstreams/webstream") {
        return jsonResponse({
          photos: [
            {
              photoGuid: "PHOTO-1",
              caption: "Kitchen",
              derivatives: {
                thumb: { checksum: "small", fileSize: "50", width: "100", height: "100" },
                large: { checksum: "large", fileSize: "500", width: "1200", height: "900" }
              }
            }
          ]
        });
      }
      if (url === "https://p119-sharedstreams.icloud.com/B1vG6XBubGftwum/sharedstreams/webasseturls") {
        return jsonResponse({
          items: {
            small: { url_location: "cvws.icloud-content.com", url_path: "/small.jpg?token=1" },
            large: { url_location: "cvws.icloud-content.com", url_path: "/large.jpg?token=2" }
          }
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  });

  const photos = await service.listIcloud({
    face: { photo: { icloudUrl: "https://www.icloud.com/sharedalbum/#B1vG6XBubGftwum" } },
    providers: { icloud: { publicAlbumUrl: "" } }
  });

  expect(photos).toEqual([
    {
      id: "icloud-PHOTO-1",
      source: "icloud",
      title: "Kitchen",
      url: "https://cvws.icloud-content.com/large.jpg?token=2"
    }
  ]);
  expect(calls.map((call) => call.url)).toEqual([
    "https://p23-sharedstreams.icloud.com/B1vG6XBubGftwum/sharedstreams/webstream",
    "https://p119-sharedstreams.icloud.com/B1vG6XBubGftwum/sharedstreams/webstream",
    "https://p119-sharedstreams.icloud.com/B1vG6XBubGftwum/sharedstreams/webasseturls"
  ]);
});

test("uses Immich API key from saved provider config", async () => {
  const calls = [];
  const service = new PhotoService({
    localPhotoDir: "/tmp/photos",
    cacheDir: "/tmp/cache",
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers });
      return jsonResponse({ assets: [{ id: "asset-1", type: "IMAGE", originalFileName: "one.jpg" }] });
    }
  });

  const photos = await service.listImmich({
    face: { photo: { immichServerUrl: "", immichAlbumId: "" } },
    providers: { immich: { serverUrl: "https://immich.example", albumId: "album-1", apiKey: "secret-key" } }
  });

  expect(calls[0]).toEqual({
    url: "https://immich.example/api/albums/album-1",
    headers: { "x-api-key": "secret-key" }
  });
  expect(photos[0]).toMatchObject({ id: "immich-asset-1", apiKey: "secret-key" });
});
