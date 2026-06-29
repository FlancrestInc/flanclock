const form = document.querySelector("#configForm");
const saveStatus = document.querySelector("#saveStatus");
const weatherStatus = document.querySelector("#weatherStatus");
const photoStatus = document.querySelector("#photoStatus");
let config;

const fields = [...form.querySelectorAll("[name]")];

async function boot() {
  config = await fetchJson("/api/config");
  fillForm(config);
}

function fillForm(data) {
  for (const field of fields) {
    const value = getPath(data, field.name);
    if (field.type === "checkbox") field.checked = Boolean(value);
    else if (value !== undefined) field.value = value;
  }
}

function readForm() {
  const data = {};
  for (const field of fields) {
    const value = field.type === "checkbox" ? field.checked : coerce(field);
    if (field.name === "admin.password" && !value) continue;
    setPath(data, field.name, value);
  }
  data.weather.provider = "openMeteo";
  data.providers = {
    immich: {
      serverUrl: data.face.photo.immichServerUrl,
      albumId: data.face.photo.immichAlbumId
    },
    icloud: {
      publicAlbumUrl: data.face.photo.icloudUrl
    }
  };
  return data;
}

function coerce(field) {
  if (field.type === "number") return Number(field.value);
  return field.value;
}

function getPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function setPath(object, path, value) {
  const parts = path.split(".");
  let current = object;
  for (const part of parts.slice(0, -1)) {
    current[part] ??= {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveStatus.textContent = "Saving...";
  try {
    config = await fetchJson("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readForm())
    });
    saveStatus.textContent = "Saved.";
  } catch (error) {
    saveStatus.textContent = error.message;
  }
});

document.querySelector('[data-test="weather"]').addEventListener("click", async () => {
  weatherStatus.textContent = "Testing...";
  try {
    const result = await fetchJson("/api/test/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weather: readForm().weather })
    });
    weatherStatus.textContent = result.status === "ok" ? `${result.temperature} degrees, ${result.condition}` : result.error;
  } catch (error) {
    weatherStatus.textContent = error.message;
  }
});

document.querySelector('[data-test="icloud"]').addEventListener("click", async () => {
  photoStatus.textContent = "Testing iCloud...";
  try {
    const payload = { providers: { icloud: { publicAlbumUrl: readForm().face.photo.icloudUrl } } };
    const result = await fetchJson("/api/test/icloud", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    photoStatus.textContent = result.status === "ok" ? `Found ${result.count} photos.` : result.error;
  } catch (error) {
    photoStatus.textContent = error.message;
  }
});

document.querySelector('[data-test="immich"]').addEventListener("click", async () => {
  photoStatus.textContent = "Testing Immich...";
  try {
    const formData = readForm();
    const result = await fetchJson("/api/test/immich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: { immich: { serverUrl: formData.face.photo.immichServerUrl, albumId: formData.face.photo.immichAlbumId } } })
    });
    photoStatus.textContent = result.status === "ok" ? `Found ${result.count} photos.` : result.error;
  } catch (error) {
    photoStatus.textContent = error.message;
  }
});

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

boot();
