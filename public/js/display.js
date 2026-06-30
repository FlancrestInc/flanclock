let config;
let weather;
let photos = [];
let photoIndex = 0;
let photoTimer;
let currentPhotoUrl = "";
let pendingPhotoUrl = "";
let photoLoadToken = 0;

const clock = document.querySelector("#clock");
const face = document.querySelector("#face");
const photoStage = document.querySelector("#photoStage");

async function boot() {
  config = await fetchJson("/api/config");
  await refreshWeather();
  await refreshPhotos();
  connectEvents();
  setInterval(render, 250);
  setInterval(refreshWeather, 10 * 60 * 1000);
  render();
}

function connectEvents() {
  const events = new EventSource("/api/events");
  events.addEventListener("config", async (event) => {
    config = JSON.parse(event.data);
    await refreshWeather();
    await refreshPhotos();
    render();
  });
}

async function refreshWeather() {
  weather = await fetchJson("/api/weather").catch(() => ({ status: "error" }));
}

async function refreshPhotos() {
  if (!config || config.face.type !== "photo") return;
  const result = await fetchJson("/api/photos").catch(() => ({ photos: [] }));
  photos = result.photos || [];
  if (photoIndex >= photos.length) photoIndex = 0;
  clearInterval(photoTimer);
  photoTimer = setInterval(nextPhoto, config.face.photo.rotationIntervalSeconds * 1000);
  showPhoto();
}

function nextPhoto() {
  if (!photos.length) return;
  photoIndex = (photoIndex + 1) % photos.length;
  showPhoto();
}

function showPhoto() {
  if (config.face.type !== "photo") {
    photoLoadToken += 1;
    currentPhotoUrl = "";
    pendingPhotoUrl = "";
    photoStage.style.backgroundImage = "";
    return;
  }
  const photo = photos[photoIndex % Math.max(photos.length, 1)];
  const url = photo?.url || "";
  if (!url) {
    photoLoadToken += 1;
    currentPhotoUrl = "";
    pendingPhotoUrl = "";
    photoStage.style.backgroundImage = "";
    return;
  }
  if (url === currentPhotoUrl || url === pendingPhotoUrl) return;

  const token = photoLoadToken + 1;
  photoLoadToken = token;
  pendingPhotoUrl = url;
  preloadPhoto(url)
    .then(() => {
      if (token !== photoLoadToken || config.face.type !== "photo") return;
      currentPhotoUrl = url;
      pendingPhotoUrl = "";
      photoStage.style.backgroundImage = `url("${url}")`;
    })
    .catch(() => {
      if (token === photoLoadToken) pendingPhotoUrl = "";
    });
}

function preloadPhoto(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
    if (image.decode) {
      image.decode().then(resolve).catch(() => {});
    }
  });
}

function render() {
  if (!config) return;
  const now = new Date();
  const parts = getTimeParts(now);
  const date = formatDate(now);
  applyBrightness(now);
  clock.dataset.face = config.face.type;
  clock.dataset.theme = config.face.theme;
  clock.style.setProperty("--modern-color", config.face.modern.color);
  clock.style.setProperty("--modern-bg", config.face.modern.backgroundColor);
  clock.style.setProperty("--modern-scale", config.face.modern.fontScale);
  clock.style.setProperty("--overlay-opacity", config.face.photo.overlayOpacity);
  clock.className = `clock-screen density-${config.face.modern.density} font-${config.face.modern.font}`;

  if (config.face.type === "nixie") return renderNixie(parts, date);
  if (config.face.type === "modern") return renderModern(parts, date);
  if (config.face.type === "photo") return renderPhoto(parts, date);
  return renderSevenSegment(parts, date);
}

function getTimeParts(now) {
  const timeZone = config.display.timezone;
  const dateTime = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: config.display.hourMode === "12",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(timeParts(dateTime).map((part) => [part.type, part.value]));
  return {
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    dayPeriod: values.dayPeriod || "",
    text: `${values.hour}:${values.minute}${config.display.showSeconds ? `:${values.second}` : ""}`
  };
}

function timeParts(parts) {
  return parts.filter((part) => part.type !== "literal" || part.value === ":");
}

function formatDate(now) {
  const timeZone = config.display.timezone;
  const f = config.display.dateFormat;
  const weekdayLong = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const monthLong = new Intl.DateTimeFormat("en-US", { timeZone, month: "long" }).format(now);
  const monthShort = new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(now);
  const numeric = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  const replacements = {
    cccc: weekdayLong,
    ccc: weekdayShort,
    LLLL: monthLong,
    LLL: monthShort,
    yyyy: numeric.year,
    MM: numeric.month.padStart(2, "0"),
    M: numeric.month,
    dd: numeric.day.padStart(2, "0"),
    d: numeric.day
  };
  return f.replace(/cccc|ccc|LLLL|LLL|yyyy|MM|M|dd|d/g, (token) => replacements[token]);
}

function renderSevenSegment(parts, date) {
  face.className = "face seven-face";
  face.innerHTML = `
    <div class="seven-time">${digits(parts.text)}</div>
    ${metaRow(date, "seven-meta")}
  `;
}

function renderNixie(parts, date) {
  face.className = "face nixie-face";
  face.innerHTML = `
    <div class="nixie-time">${[...parts.text].map((char) => char === ":" ? '<span class="nixie-colon">:</span>' : `<span class="tube"><span>${char}</span></span>`).join("")}</div>
    ${metaRow(date, "nixie-meta")}
  `;
}

function renderModern(parts, date) {
  face.className = "face modern-face";
  face.innerHTML = `
    <div class="modern-time">${parts.text}<span>${parts.dayPeriod}</span></div>
    ${metaRow(date, "modern-meta")}
  `;
}

function renderPhoto(parts, date) {
  showPhoto();
  face.className = `face photo-face pos-${config.face.photo.overlayPosition}`;
  const showDate = config.display.showDate && config.face.photo.showDate;
  const showWeather = config.weather.enabled && config.face.photo.showWeather;
  face.innerHTML = `
    <div class="photo-overlay">
      <div class="photo-time">${parts.text}<span>${parts.dayPeriod}</span></div>
      ${showDate ? `<div class="photo-date">${date}</div>` : ""}
      ${showWeather ? weatherLine("photo-weather") : ""}
      ${photos.length ? "" : '<div class="photo-status">Add photos to the configured album.</div>'}
    </div>
  `;
}

function metaRow(date, className) {
  const dateHtml = config.display.showDate ? `<div>${date}</div>` : "";
  const weatherHtml = config.weather.enabled ? weatherLine("") : "";
  return `<div class="${className} meta ${config.display.datePosition}">${dateHtml}${weatherHtml}</div>`;
}

function weatherLine(extraClass) {
  if (!weather || weather.status !== "ok") return `<div class="${extraClass} weather muted">Weather unavailable</div>`;
  const unit = weather.units === "fahrenheit" ? "F" : "C";
  return `<div class="${extraClass} weather">${weather.temperature}&deg;${unit} ${weather.condition}</div>`;
}

function digits(text) {
  return [...text].map((char) => {
    const name = char === ":" ? "colon" : char;
    const className = char === ":" ? "seven-segment-colon" : "seven-segment-digit";
    return `<span class="${className}" aria-hidden="true" style="--segment-src: url('/static/img/seven-segment/${name}.svg')"></span>`;
  }).join("");
}

function applyBrightness(now) {
  const dim = config.display.brightness;
  if (!dim.enabled) {
    clock.style.filter = "";
    return;
  }
  const minutes = localMinutes(now);
  const start = parseMinutes(dim.dimStart);
  const end = parseMinutes(dim.dimEnd);
  const active = start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  clock.style.filter = active ? `brightness(${dim.dimOpacity})` : "";
}

function localMinutes(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: config.display.timezone, hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

boot();
