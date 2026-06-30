const form = document.querySelector("#configForm");
const saveStatus = document.querySelector("#saveStatus");
const weatherStatus = document.querySelector("#weatherStatus");
const photoStatus = document.querySelector("#photoStatus");
const detectLocationButton = document.querySelector('[data-test="weather-location"]');
let config;

const fields = [...form.querySelectorAll("[name]")];
const fieldsByName = new Map(fields.map((field) => [field.name, field]));
const conditionalElements = [...form.querySelectorAll("[data-show-when]")];
const photoSourceElements = [...form.querySelectorAll("[data-photo-source]")];

async function boot() {
  config = await fetchJson("/api/config");
  fillForm(config);
  syncConditionalFields();
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
    if (field.name === "providers.immich.apiKey" && !value) continue;
    setPath(data, field.name, value);
  }
  data.weather.provider = "openMeteo";
  const immichApiKey = data.providers?.immich?.apiKey;
  data.providers = {
    immich: {
      serverUrl: data.face.photo.immichServerUrl,
      albumId: data.face.photo.immichAlbumId,
      ...(immichApiKey ? { apiKey: immichApiKey } : {})
    },
    icloud: {
      publicAlbumUrl: data.face.photo.icloudUrl
    }
  };
  return data;
}

function syncConditionalFields() {
  for (const element of conditionalElements) {
    element.hidden = !matchesVisibilityRule(element.dataset.showWhen);
  }
  syncPhotoSourceFields();
}

function matchesVisibilityRule(rule) {
  const [fieldName, expectedValues] = rule.split(":");
  const field = fieldsByName.get(fieldName);
  if (!field) return true;
  return expectedValues.split(",").includes(field.value);
}

function syncPhotoSourceFields() {
  const selectedSource = fieldsByName.get("face.photo.source")?.value;
  for (const element of photoSourceElements) {
    element.hidden = element.dataset.photoSource !== selectedSource;
  }
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

function setFieldValue(name, value) {
  const field = fieldsByName.get(name);
  if (field) field.value = value;
}

function detectLocation() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Location detection is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 300000,
      timeout: 10000
    });
  });
}

function describeLocationError(error) {
  if (error.code === 1) return "Location permission was denied.";
  if (error.code === 2) return "Location could not be determined.";
  if (error.code === 3) return "Location detection timed out.";
  return error.message || "Location detection failed.";
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

for (const fieldName of ["face.type", "face.photo.source"]) {
  fieldsByName.get(fieldName)?.addEventListener?.("change", syncConditionalFields);
}

detectLocationButton.addEventListener("click", async () => {
  weatherStatus.textContent = "Detecting location...";
  detectLocationButton.disabled = true;
  try {
    const position = await detectLocation();
    setFieldValue("weather.latitude", position.coords.latitude.toFixed(4));
    setFieldValue("weather.longitude", position.coords.longitude.toFixed(4));
    weatherStatus.textContent = "Location detected. Save configuration to keep it.";
  } catch (error) {
    weatherStatus.textContent = describeLocationError(error);
  } finally {
    detectLocationButton.disabled = false;
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
      body: JSON.stringify({
        providers: {
          immich: {
            serverUrl: formData.face.photo.immichServerUrl,
            albumId: formData.face.photo.immichAlbumId,
            ...(formData.providers.immich.apiKey ? { apiKey: formData.providers.immich.apiKey } : {})
          }
        }
      })
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
