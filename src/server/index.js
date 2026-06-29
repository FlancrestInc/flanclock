import "dotenv/config";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import sanitizeHtml from "sanitize-html";
import { ConfigStore } from "./configStore.js";
import { WeatherService } from "./weather.js";
import { PhotoService } from "./photos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const publicDir = path.join(rootDir, "public");

export async function createApp(env = process.env) {
  const app = express();
  const store = new ConfigStore({
    configPath: path.resolve(rootDir, env.CONFIG_PATH || "./data/config.json"),
    adminPassword: env.ADMIN_PASSWORD
  });
  await store.init();

  const weatherService = new WeatherService();
  const photoService = new PhotoService({
    localPhotoDir: path.resolve(rootDir, env.LOCAL_PHOTO_DIR || "./data/photos"),
    cacheDir: path.resolve(rootDir, env.PHOTO_CACHE_DIR || "./data/cache/photos")
  });

  app.locals.store = store;
  app.locals.weatherService = weatherService;
  app.locals.photoService = photoService;

  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: env.SESSION_SECRET || "dev-clock-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 }
    })
  );

  const adminLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 30, standardHeaders: true });

  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "display.html")));
  app.use("/static", express.static(publicDir, { maxAge: "1h" }));

  app.get("/admin", (req, res) => {
    if (!req.session.authenticated) return res.sendFile(path.join(publicDir, "login.html"));
    return res.sendFile(path.join(publicDir, "admin.html"));
  });

  app.post("/admin/login", adminLimiter, async (req, res) => {
    const ok = await store.verifyPassword(String(req.body.password || ""));
    if (!ok) return res.status(401).send(renderLoginError());
    req.session.authenticated = true;
    return res.redirect("/admin");
  });

  app.post("/admin/logout", requireAdmin, (req, res) => {
    req.session.destroy(() => res.redirect("/admin"));
  });

  app.get("/api/config", (_req, res) => {
    res.json(store.getPublic());
  });

  app.put("/api/config", requireAdmin, async (req, res) => {
    try {
      const cleaned = sanitizeConfig(req.body);
      const nextPassword = cleaned.admin?.password;
      if (cleaned.admin) delete cleaned.admin;
      await store.update(cleaned);
      if (nextPassword) await store.changePassword(nextPassword);
      res.json(store.getPublic());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write(`event: config\ndata: ${JSON.stringify(store.getPublic())}\n\n`);
    const unsubscribe = store.subscribe((config) => {
      res.write(`event: config\ndata: ${JSON.stringify(config)}\n\n`);
    });
    req.on("close", unsubscribe);
  });

  app.get("/api/weather", async (_req, res) => {
    res.json(await weatherService.getWeather(store.get()));
  });

  app.post("/api/test/weather", requireAdmin, async (req, res) => {
    try {
      res.json(await weatherService.test({ ...store.get().weather, ...sanitizeConfig(req.body).weather }));
    } catch (error) {
      res.status(400).json({ status: "error", error: error.message });
    }
  });

  app.post("/api/test/immich", requireAdmin, async (req, res) => {
    try {
      res.json(await photoService.testImmich(sanitizeConfig(req.body).providers?.immich || req.body));
    } catch (error) {
      res.status(400).json({ status: "error", error: error.message });
    }
  });

  app.post("/api/test/icloud", requireAdmin, async (req, res) => {
    try {
      res.json(await photoService.testIcloud(sanitizeConfig(req.body).providers?.icloud || req.body));
    } catch (error) {
      res.status(400).json({ status: "error", error: error.message });
    }
  });

  app.get("/api/photos", async (_req, res) => {
    try {
      const photos = await photoService.listPhotos(store.get());
      res.json({ status: "ok", photos: photos.map(({ filePath, serverUrl, remoteId, ...photo }) => photo) });
    } catch (error) {
      res.json({ status: "error", error: error.message, photos: [] });
    }
  });

  app.get("/api/photos/:id", async (req, res) => {
    try {
      const photo = await photoService.resolvePhoto(req.params.id, store.get());
      if (!photo) return res.status(404).send("Photo not found");
      if (photo.source === "local") return res.sendFile(photo.filePath);
      if (photo.source === "immich") {
        const upstream = await photoService.streamImmichAsset(photo);
        res.type(upstream.headers.get("content-type") || "image/jpeg");
        return Readable.fromWeb(upstream.body).pipe(res);
      }
      return res.redirect(photo.url);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  return app;
}

function requireAdmin(req, res, next) {
  if (req.session.authenticated) return next();
  return res.status(401).json({ error: "Admin login required." });
}

function sanitizeConfig(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(
    JSON.stringify(value, (_key, fieldValue) => {
      if (typeof fieldValue === "string") {
        return sanitizeHtml(fieldValue.trim(), { allowedTags: [], allowedAttributes: {} });
      }
      return fieldValue;
    })
  );
}

function renderLoginError() {
  return `<!doctype html><title>Clock Admin</title><link rel="stylesheet" href="/static/css/admin.css"><main class="login"><h1>Clock Admin</h1><p class="error">Incorrect password.</p><form method="post" action="/admin/login"><input type="password" name="password" autofocus placeholder="Admin password"><button>Log in</button></form></main>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`Pi clock running at http://${host}:${port}`);
  });
}
