import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { DEFAULT_CONFIG } from "./defaultConfig.js";
import { validateConfig } from "./validation.js";

function deepMerge(base, overlay) {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return overlay ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay ?? {})) {
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

export class ConfigStore {
  constructor({ configPath, adminPassword }) {
    this.configPath = configPath;
    this.adminPassword = adminPassword || "clockadmin";
    this.subscribers = new Set();
    this.config = null;
  }

  async init() {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    let loaded = {};
    try {
      loaded = JSON.parse(await fs.readFile(this.configPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const merged = deepMerge(DEFAULT_CONFIG, loaded);
    if (!merged.admin.passwordHash) {
      merged.admin.passwordHash = await bcrypt.hash(this.adminPassword, 10);
      merged.admin.passwordChangedAt = new Date().toISOString();
    }
    this.config = validateConfig(merged);
    await this.save(false);
    return this.config;
  }

  get() {
    return structuredClone(this.config);
  }

  getPublic() {
    const config = this.get();
    delete config.admin;
    config.face.photo.immichServerUrl = "";
    config.providers.immich.serverUrl = "";
    return config;
  }

  async update(nextConfig) {
    const merged = deepMerge(this.config, nextConfig);
    this.config = validateConfig(merged);
    await this.save(true);
    return this.get();
  }

  async changePassword(password) {
    if (!password || password.length < 8) {
      throw new Error("Admin password must be at least 8 characters.");
    }
    this.config.admin.passwordHash = await bcrypt.hash(password, 10);
    this.config.admin.passwordChangedAt = new Date().toISOString();
    await this.save(true);
  }

  async verifyPassword(password) {
    return bcrypt.compare(password || "", this.config.admin.passwordHash);
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  async save(emit) {
    await fs.writeFile(this.configPath, `${JSON.stringify(this.config, null, 2)}\n`, "utf8");
    if (emit) {
      for (const subscriber of this.subscribers) subscriber(this.getPublic());
    }
  }
}
