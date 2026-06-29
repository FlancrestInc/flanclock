import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mime from "mime-types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);

function hashId(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 24);
}

function normalizeBaseUrl(input) {
  const url = new URL(input);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class PhotoService {
  constructor({ localPhotoDir, cacheDir, fetchImpl = fetch }) {
    this.localPhotoDir = localPhotoDir;
    this.cacheDir = cacheDir;
    this.fetch = fetchImpl;
    this.metadataCache = new Map();
  }

  async listPhotos(config) {
    const source = config.face.photo.source;
    if (source === "immich") return this.listImmich(config);
    if (source === "icloud") return this.listIcloud(config);
    return this.listLocal(config.face.photo.localFolder || this.localPhotoDir);
  }

  async resolvePhoto(id, config) {
    const photos = await this.listPhotos(config);
    return photos.find((photo) => photo.id === id) || null;
  }

  async listLocal(folder) {
    const resolved = path.resolve(folder || this.localPhotoDir);
    const entries = await fs.readdir(resolved, { withFileTypes: true }).catch(() => []);
    const photos = entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const filePath = path.join(resolved, entry.name);
        return {
          id: hashId(filePath),
          source: "local",
          title: entry.name,
          url: `/api/photos/${hashId(filePath)}`,
          contentType: mime.lookup(entry.name) || "image/jpeg",
          filePath
        };
      });
    return photos;
  }

  async listImmich(config) {
    const serverUrl = config.face.photo.immichServerUrl || config.providers.immich.serverUrl;
    const albumId = config.face.photo.immichAlbumId || config.providers.immich.albumId;
    const apiKey = process.env.IMMICH_API_KEY || "";
    if (!serverUrl || !albumId || !apiKey) return [];
    const cacheKey = `immich:${serverUrl}:${albumId}`;
    const cached = this.readMetadataCache(cacheKey, 10 * 60 * 1000);
    if (cached) return cached;
    const base = normalizeBaseUrl(serverUrl);
    const response = await this.fetch(`${base}/api/albums/${encodeURIComponent(albumId)}`, {
      headers: { "x-api-key": apiKey }
    });
    if (!response.ok) throw new Error(`Immich returned ${response.status}`);
    const album = await response.json();
    const photos = (album.assets || [])
      .filter((asset) => asset.type === "IMAGE")
      .map((asset) => ({
        id: `immich-${asset.id}`,
        source: "immich",
        title: asset.originalFileName || asset.id,
        url: `/api/photos/immich-${asset.id}`,
        remoteId: asset.id,
        serverUrl: base
      }));
    this.writeMetadataCache(cacheKey, photos);
    return photos;
  }

  async listIcloud(config) {
    const publicAlbumUrl = config.face.photo.icloudUrl || config.providers.icloud.publicAlbumUrl;
    if (!publicAlbumUrl) return [];
    const cacheKey = `icloud:${publicAlbumUrl}`;
    const cached = this.readMetadataCache(cacheKey, 30 * 60 * 1000);
    if (cached) return cached;
    const html = await (await this.fetch(publicAlbumUrl)).text();
    const imageUrls = [...html.matchAll(/https:\\?\/\\?\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*/gi)]
      .map((match) => match[0].replaceAll("\\/", "/"))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 200);
    const photos = imageUrls.map((url, index) => ({
      id: `icloud-${hashId(url)}`,
      source: "icloud",
      title: `iCloud photo ${index + 1}`,
      url
    }));
    this.writeMetadataCache(cacheKey, photos);
    return photos;
  }

  async streamImmichAsset(photo) {
    const apiKey = process.env.IMMICH_API_KEY || "";
    const response = await this.fetch(`${photo.serverUrl}/api/assets/${photo.remoteId}/thumbnail?size=preview`, {
      headers: { "x-api-key": apiKey }
    });
    if (!response.ok) throw new Error(`Immich asset returned ${response.status}`);
    return response;
  }

  readMetadataCache(key, ttlMs) {
    const cached = this.metadataCache.get(key);
    if (!cached || Date.now() - cached.fetchedAt > ttlMs) return null;
    return cached.value;
  }

  writeMetadataCache(key, value) {
    this.metadataCache.set(key, { fetchedAt: Date.now(), value });
  }

  async testImmich({ serverUrl, albumId }) {
    const apiKey = process.env.IMMICH_API_KEY || "";
    if (!serverUrl || !albumId || !apiKey) {
      return { status: "error", error: "Immich server URL, album ID, and IMMICH_API_KEY are required." };
    }
    const config = {
      face: { photo: { source: "immich", immichServerUrl: serverUrl, immichAlbumId: albumId } },
      providers: { immich: { serverUrl, albumId }, icloud: { publicAlbumUrl: "" } }
    };
    const photos = await this.listImmich(config);
    return { status: "ok", count: photos.length };
  }

  async testIcloud({ publicAlbumUrl }) {
    if (!publicAlbumUrl) return { status: "error", error: "Public shared album URL is required." };
    const config = {
      face: { photo: { source: "icloud", icloudUrl: publicAlbumUrl } },
      providers: { icloud: { publicAlbumUrl }, immich: { serverUrl: "", albumId: "" } }
    };
    const photos = await this.listIcloud(config);
    return { status: "ok", count: photos.length };
  }
}
