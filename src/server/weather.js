const WEATHER_CODES = new Map([
  [0, "Clear"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Cloudy"],
  [45, "Fog"],
  [48, "Rime fog"],
  [51, "Light drizzle"],
  [53, "Drizzle"],
  [55, "Heavy drizzle"],
  [61, "Light rain"],
  [63, "Rain"],
  [65, "Heavy rain"],
  [71, "Light snow"],
  [73, "Snow"],
  [75, "Heavy snow"],
  [80, "Rain showers"],
  [95, "Thunderstorm"]
]);

export class WeatherService {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetch = fetchImpl;
    this.cache = null;
  }

  async getWeather(config, { force = false } = {}) {
    if (!config.weather.enabled) {
      return { enabled: false, status: "disabled" };
    }
    const now = Date.now();
    const ttlMs = config.weather.cacheTtlMinutes * 60 * 1000;
    if (!force && this.cache && now - this.cache.fetchedAt < ttlMs) {
      return this.cache.value;
    }
    try {
      const value = await this.fetchOpenMeteo(config.weather);
      this.cache = { fetchedAt: now, value };
      return value;
    } catch (error) {
      if (this.cache) {
        return { ...this.cache.value, stale: true, error: "Weather refresh failed." };
      }
      return { enabled: true, status: "error", error: error.message };
    }
  }

  async fetchOpenMeteo(settings) {
    const temperatureUnit = settings.units === "fahrenheit" ? "fahrenheit" : "celsius";
    const windSpeedUnit = settings.units === "fahrenheit" ? "mph" : "kmh";
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(settings.latitude),
      longitude: String(settings.longitude),
      current: "temperature_2m,weather_code,wind_speed_10m",
      temperature_unit: temperatureUnit,
      wind_speed_unit: windSpeedUnit,
      timezone: "auto"
    }).toString();
    const response = await this.fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const data = await response.json();
    const current = data.current;
    if (!current) throw new Error("Open-Meteo response did not include current weather.");
    return {
      enabled: true,
      status: "ok",
      provider: "openMeteo",
      locationLabel: settings.locationLabel,
      temperature: Math.round(current.temperature_2m),
      units: settings.units,
      windSpeed: Math.round(current.wind_speed_10m ?? 0),
      condition: WEATHER_CODES.get(current.weather_code) || "Weather",
      code: current.weather_code,
      observedAt: current.time
    };
  }

  async test(settings) {
    const config = { weather: { ...settings, enabled: true } };
    return this.getWeather(config, { force: true });
  }
}
