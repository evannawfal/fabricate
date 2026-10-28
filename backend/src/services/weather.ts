import { env } from '../config/env.js';

// The current weather at the user's location, used when generating a daily outfit.
export interface Weather {
  // Rounded to whole degrees, which is all an outfit choice needs.
  temperatureC: number;
  // OpenWeather's condition group, e.g. "Rain" or "Clear"
  condition: string;
  // e.g. "light rain"
  description: string;
}

export interface WeatherService {
  // Resolves to null instead of failing when the weather can't be retrieved,
  // so an outfit can still be generated without it.
  getCurrentWeather(latitude: number, longitude: number): Promise<Weather | null>;
}

const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
// Outfit generation waits for the weather, so give up quickly rather than keep the user waiting.
const REQUEST_TIMEOUT_MS = 5_000;

interface OpenWeatherResponse {
  main?: { temp?: unknown };
  weather?: { main?: unknown; description?: unknown }[];
}

function parseWeather(body: OpenWeatherResponse): Weather | null {
  const temperature = body.main?.temp;
  // OpenWeather can report several conditions at once; the first is the main one.
  const conditions = body.weather?.[0];
  if (typeof temperature !== 'number' || typeof conditions?.main !== 'string' || typeof conditions.description !== 'string') {
    return null;
  }
  return { temperatureC: Math.round(temperature), condition: conditions.main, description: conditions.description };
}

// fetchFn is replaced in tests so that no real request is sent.
export function createOpenWeatherService(apiKey: string, fetchFn: typeof fetch = fetch): WeatherService {
  return {
    async getCurrentWeather(latitude, longitude) {
      const url = new URL(OPENWEATHER_URL);
      url.search = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        units: 'metric',
        appid: apiKey,
      }).toString();
      try {
        const response = await fetchFn(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) {
          console.error(`OpenWeather request failed with status ${response.status}`);
          return null;
        }
        const weather = parseWeather((await response.json()) as OpenWeatherResponse);
        if (weather === null) {
          console.error('OpenWeather returned an unexpected response');
        }
        return weather;
      } catch (err) {
        // Network errors, timeouts and invalid JSON: the outfit is generated without the weather.
        console.error('Could not get the current weather:', err);
        return null;
      }
    },
  };
}

// Without an OpenWeather API key, outfits are generated without the weather.
const noWeather: WeatherService = { getCurrentWeather: async () => null };

let defaultWeatherService: WeatherService | undefined;

// Replaces the app-wide weather service (e.g. with a stand-in in tests); undefined goes back to the env-configured one.
export function setWeatherService(service: WeatherService | undefined): void {
  defaultWeatherService = service;
}

// The app-wide weather service, configured from OPENWEATHER_API_KEY.
export function getWeatherService(): WeatherService {
  defaultWeatherService ??=
    env.openWeatherApiKey === undefined ? noWeather : createOpenWeatherService(env.openWeatherApiKey);
  return defaultWeatherService;
}
