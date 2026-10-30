import { OPENWEATHER_URL, WEATHER_REQUEST_TIMEOUT_MS } from '../config/constants.js';
import { env } from '../config/env.js';

export interface Weather {
  temperatureC: number;
  condition: string;
  description: string;
}

export interface WeatherService {
  // Never throws, so a weather outage can't stop an outfit from being generated.
  getCurrentWeather(latitude: number, longitude: number): Promise<Weather | null>;
}

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
        const response = await fetchFn(url, { signal: AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS) });
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
        console.error('Could not get the current weather:', err);
        return null;
      }
    },
  };
}

const noWeather: WeatherService = { getCurrentWeather: () => Promise.resolve(null) };

let defaultWeatherService: WeatherService | undefined;

// undefined goes back to the service configured from the environment.
export function setWeatherService(service: WeatherService | undefined): void {
  defaultWeatherService = service;
}

export function getWeatherService(): WeatherService {
  defaultWeatherService ??=
    env.openWeatherApiKey === undefined ? noWeather : createOpenWeatherService(env.openWeatherApiKey);
  return defaultWeatherService;
}
