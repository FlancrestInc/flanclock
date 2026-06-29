import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mime from "mime-types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);
const ICLOUD_SHARED_STREAM_HOST = "p23-sharedstreams.icloud.com";

function hashId(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 24);
}

function normalizeBaseUrl(input) {
  const url = new URL(input);
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

function getIcloudAlbumToken(input) {
  const url = new URL(input);
  const token = url.hash.replace(/^#/, "") || url.pathname.split("/").filter(Boolean).at(-1);
  if (!token || !/^[a-zA-Z0-9_-]+$/.test(token)) throw new Error("Invalid iCloud shared album URL.");
  return token;
}

function largestDerivative(photo) {
  return Object.values(photo.derivatives || {})
    .filter((derivative) => derivative?.checksum)
    .sort((a, b) => Number(b.fileSize || 0) - Number(a.fileSize || 0))[0];
}

function icloudAssetUrl(asset) {
  if (!asset?.url_location || !asset?.url_path) return "";
  const scheme = asset.scheme || "https";
  return `${scheme}://${asset.url_location}${asset.url_path}`;
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
    const apiKey = config.providers.immich.apiKey || process.env.IMMICH_API_KEY || "";
    if (!serverUrl || !albumId || !apiKey) return [];
    const cacheKey = `immich:${serverUrl}:${albumId}:${hashId(apiKey)}`;
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
        serverUrl: base,
        apiKey
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
    const token = getIcloudAlbumToken(publicAlbumUrl);
    const { stream, baseUrl } = await this.fetchIcloudStream(token);
    const photosWithDerivatives = (stream.photos || [])
      .map((photo) => ({ photo, derivative: largestDerivative(photo) }))
      .filter(({ photo, derivative }) => photo.photoGuid && derivative?.checksum)
      .slice(0, 200);
    if (!photosWithDerivatives.length) {
      this.writeMetadataCache(cacheKey, []);
      return [];
    }
    const assets = await this.postJson(`${baseUrl}/webasseturls`, {
      photoGuids: photosWithDerivatives.map(({ photo }) => photo.photoGuid)
    });
    const photos = photosWithDerivatives
      .map(({ photo, derivative }, index) => ({
        id: `icloud-${photo.photoGuid}`,
        source: "icloud",
        title: photo.caption || `iCloud photo ${index + 1}`,
        url: icloudAssetUrl(assets.items?.[derivative.checksum])
      }))
      .filter((photo) => photo.url);
    this.writeMetadataCache(cacheKey, photos);
    return photos;
  }

  async streamImmichAsset(photo) {
    const apiKey = photo.apiKey || process.env.IMMICH_API_KEY || "";
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

  async postJson(url, body) {
    const response = await this.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok && response.status !== 330) throw new Error(`iCloud returned ${response.status}`);
    return data;
  }

  async fetchIcloudStream(token) {
    let host = ICLOUD_SHARED_STREAM_HOST;
    let baseUrl = `https://${host}/${token}/sharedstreams`;
    let stream = await this.postJson(`${baseUrl}/webstream`, { streamCtag: null });
    const redirectedHost = stream["X-Apple-MMe-Host"];
    if (redirectedHost) {
      host = redirectedHost;
      baseUrl = `https://${host}/${token}/sharedstreams`;
      stream = await this.postJson(`${baseUrl}/webstream`, { streamCtag: null });
    }
    return { stream, baseUrl };
  }

  async testImmich({ serverUrl, albumId, apiKey }) {
    apiKey ||= process.env.IMMICH_API_KEY || "";
    if (!serverUrl || !albumId || !apiKey) {
      return { status: "error", error: "Immich server URL, album ID, and API key are required." };
    }
    const config = {
      face: { photo: { source: "immich", immichServerUrl: serverUrl, immichAlbumId: albumId } },
      providers: { immich: { serverUrl, albumId, apiKey }, icloud: { publicAlbumUrl: "" } }
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
