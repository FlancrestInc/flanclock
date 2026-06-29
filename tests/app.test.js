import { beforeEach, expect, test } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server/index.js";

let app;
let agent;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clock-app-"));
  app = await createApp({
    CONFIG_PATH: path.join(dir, "config.json"),
    LOCAL_PHOTO_DIR: path.join(dir, "photos"),
    PHOTO_CACHE_DIR: path.join(dir, "cache"),
    ADMIN_PASSWORD: "secret123",
    SESSION_SECRET: "test-session"
  });
  agent = request.agent(app);
});

test("serves display and public config", async () => {
  const display = await request(app).get("/");
  const config = await request(app).get("/api/config");

  expect(display.text).toContain("Pi Clock");
  expect(config.body.display.timezone).toBe("America/Denver");
  expect(config.body.admin).toBeUndefined();
});

test("protects config updates behind admin login", async () => {
  await request(app).put("/api/config").send({ display: { timezone: "UTC" } }).expect(401);

  await agent.post("/admin/login").type("form").send({ password: "secret123" }).expect(302);
  const response = await agent.put("/api/config").send({ display: { timezone: "UTC" } }).expect(200);

  expect(response.body.display.timezone).toBe("UTC");
});
