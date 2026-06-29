import { describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConfigStore } from "../src/server/configStore.js";

test("creates default persistent config with configured admin password", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clock-config-"));
  const store = new ConfigStore({ configPath: path.join(dir, "config.json"), adminPassword: "secret123" });
  await store.init();

  expect(store.get().display.timezone).toBe("America/Denver");
  expect(await store.verifyPassword("secret123")).toBe(true);
  expect(await store.verifyPassword("wrong")).toBe(false);
  expect(JSON.parse(await fs.readFile(path.join(dir, "config.json"), "utf8")).admin.passwordHash).toMatch(/^\$2/);
});

test("updates public clock settings and hides admin data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clock-config-"));
  const store = new ConfigStore({ configPath: path.join(dir, "config.json"), adminPassword: "secret123" });
  await store.init();

  await store.update({ display: { timezone: "UTC", hourMode: "24" } });

  expect(store.get().display.timezone).toBe("UTC");
  expect(store.getPublic().admin).toBeUndefined();
});
