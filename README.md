# Pi Clock Display

A lightweight fullscreen clock web app for a Raspberry Pi with an 800x480 kiosk display.

## Features

- Fullscreen display at `/` with no visible controls, cursor, menus, or admin UI
- Password-protected admin page at `/admin`
- Persistent local JSON configuration in `data/config.json`
- Live display updates through Server-Sent Events
- Timezone-aware clock display, defaulting to `America/Denver`
- 12-hour/24-hour modes, optional seconds, optional date, configurable date format
- Four clock face families:
  - Seven-segment LED/LCD themes
  - Nixie-inspired original CSS face
  - Modern digital typography face
  - Photo face with readable overlay
- Weather through Open-Meteo with local caching
- Photo providers:
  - Local folder
  - iCloud public shared album URL metadata parsing
  - Immich album support with API key kept server-side
- Software dimming schedule extension point

## Requirements

- Node.js 20 or newer
- Raspberry Pi OS with Chromium for kiosk mode

## Quick Start

```bash
npm install
cp .env.example .env
npm start
```

Open:

- Clock display: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`

The default admin password comes from `ADMIN_PASSWORD` in `.env`. If no `.env` is present, it defaults to `clockadmin`. Change it from the admin page after first login.

## Configuration

Runtime settings are stored in `data/config.json`, which is intentionally ignored by git. Secrets live in `.env`.

Important `.env` values:

```bash
PORT=3000
HOST=0.0.0.0
SESSION_SECRET=change-this-long-random-string
ADMIN_PASSWORD=clockadmin
IMMICH_API_KEY=your-immich-api-key
CONFIG_PATH=./data/config.json
PHOTO_CACHE_DIR=./data/cache/photos
LOCAL_PHOTO_DIR=./data/photos
```

The admin page controls all user-facing clock options: timezone, hour mode, seconds, date, face, themes, modern font/colors, weather, photo source, album settings, rotation interval, overlay settings, dimming schedule, and admin password.

## Date Formats

The display supports common Luxon-style tokens:

- `cccc`: full weekday, such as `Monday`
- `ccc`: short weekday, such as `Mon`
- `LLLL`: full month
- `LLL`: short month
- `yyyy`: year
- `M` / `MM`: month number
- `d` / `dd`: day number

Example: `cccc, LLLL d` renders like `Monday, June 29`.

## Photos

### Local Folder

Put images in `data/photos`, or set another folder in the admin page. Supported extensions are `jpg`, `jpeg`, `png`, `gif`, `webp`, and `avif`.

### iCloud Public Shared Albums

Paste a public iCloud shared album URL into the admin page and select `icloud` as the photo source. This app only uses public shared links and does not require private iCloud credentials. Metadata is cached in memory and refreshed periodically.

Apple may change public album page markup over time; if the test button reports zero photos for a valid public album, the adapter in `src/server/photos.js` is the place to update.

### Immich Albums

Set:

- `IMMICH_API_KEY` in `.env`
- Immich server URL in the admin page
- Immich album ID in the admin page
- Photo source to `immich`

The browser never receives the Immich API key. Images are proxied through `/api/photos/:id`.

## Weather

Weather uses Open-Meteo and does not need an API key. Enter latitude/longitude directly in the admin page. Results are cached according to the configured cache TTL; if refresh fails, the clock keeps running and shows stale or unavailable weather instead of breaking.

## Raspberry Pi Kiosk Mode

Start the app:

```bash
npm start
```

Launch Chromium fullscreen:

```bash
chromium-browser \
  --kiosk \
  --disable-infobars \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  http://localhost:3000/
```

For an 800x480 display, configure the Pi display resolution through Raspberry Pi OS display settings or `/boot/firmware/config.txt` as appropriate for your screen.

## systemd

An example service is included at `systemd/pi-clock.service`.

Edit the paths and user, then install:

```bash
sudo cp systemd/pi-clock.service /etc/systemd/system/pi-clock.service
sudo systemctl daemon-reload
sudo systemctl enable --now pi-clock.service
```

## Docker

Docker is optional. Running directly with Node is simpler on a Pi, but these files are provided:

```bash
docker compose up --build
```

## Development

```bash
npm run dev
npm test
npm run lint
```

The server code is split by responsibility:

- `src/server/index.js`: routes, sessions, SSE, static files
- `src/server/configStore.js`: persistent settings and password hashing
- `src/server/validation.js`: config schema
- `src/server/weather.js`: Open-Meteo provider and caching
- `src/server/photos.js`: local, iCloud, and Immich photo providers
- `public/js/display.js`: fullscreen face rendering
- `public/js/admin.js`: admin form behavior

## Security Notes

- `/admin` and config mutation endpoints require a session login.
- Login is rate-limited.
- Immich API keys stay in `.env` and are not sent to the browser.
- User-provided text and URLs are sanitized and schema-validated.
- This is intended for a trusted local network. Use a reverse proxy with HTTPS if exposing it beyond your LAN.
