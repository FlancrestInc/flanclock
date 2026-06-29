import { expect, test } from "vitest";
import { WeatherService } from "../src/server/weather.js";

test("fetches and normalizes Open-Meteo weather", async () => {
  let calls = 0;
  const service = new WeatherService({
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 72.4,
            weather_code: 1,
            wind_speed_10m: 8,
            time: "2026-06-29T12:00"
          }
        })
      };
    }
  });
  const config = {
    weather: {
      enabled: true,
      latitude: 39.7,
      longitude: -105,
      units: "fahrenheit",
      locationLabel: "Denver",
      cacheTtlMinutes: 20
    }
  };

  const first = await service.getWeather(config);
  const second = await service.getWeather(config);

  expect(first).toMatchObject({ status: "ok", temperature: 72, condition: "Mainly clear" });
  expect(second).toEqual(first);
  expect(calls).toBe(1);
});
