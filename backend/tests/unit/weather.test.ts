import { jest } from '@jest/globals';

import { env } from '../../src/config/env.js';
import { createOpenWeatherService, getWeatherService, setWeatherService } from '../../src/services/weather.js';

// UBC's coordinates, used wherever the location doesn't matter.
const LATITUDE = 49.26;
const LONGITUDE = -123.25;

// Trimmed-down OpenWeather current weather response for Vancouver.
const VANCOUVER = {
  name: 'Vancouver',
  main: { temp: 11.6, feels_like: 10.9, humidity: 87 },
  weather: [{ id: 500, main: 'Rain', description: 'light rain', icon: '10d' }],
};

// A stand-in for fetch: nothing is sent to OpenWeather.
function fakeFetch(result: Response | Error) {
  const fetchFn = jest.fn<typeof fetch>();
  // Checked against Response rather than Error: a DOMException isn't an Error inside Jest's sandbox.
  if (result instanceof Response) {
    fetchFn.mockResolvedValue(result);
  } else {
    fetchFn.mockRejectedValue(result);
  }
  return fetchFn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// The service logs every failure; silence it, and let tests check what was logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  setWeatherService(undefined);
  jest.restoreAllMocks();
});

describe('OpenWeather weather service', () => {
  // Mocked behavior: OpenWeather returns the current weather in Vancouver
  // Input: UBC's coordinates
  // Expected behavior: one request for metric units at those coordinates, with the API key
  // Expected output: { temperatureC: 12, condition: "Rain", description: "light rain" }
  test('Returns the current weather', async () => {
    const fetchFn = fakeFetch(jsonResponse(VANCOUVER));

    const weather = await createOpenWeatherService('test-key', fetchFn).getCurrentWeather(LATITUDE, LONGITUDE);

    expect(weather).toEqual({ temperatureC: 12, condition: 'Rain', description: 'light rain' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://api.openweathermap.org/data/2.5/weather');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: String(LATITUDE),
      lon: String(LONGITUDE),
      units: 'metric',
      appid: 'test-key',
    });
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // Mocked behavior: OpenWeather rejects the request (e.g. invalid API key or rate limit)
  // Input: any coordinates
  // Expected behavior: the failure is logged
  // Expected output: null
  test.each([401, 429, 500])('API error %i', async (status) => {
    const fetchFn = fakeFetch(jsonResponse({ cod: status, message: 'error' }, status));

    const weather = await createOpenWeatherService('test-key', fetchFn).getCurrentWeather(LATITUDE, LONGITUDE);

    expect(weather).toBeNull();
    expect(console.error).toHaveBeenCalledWith(`OpenWeather request failed with status ${status}`);
  });

  // Mocked behavior: the request fails before a response arrives (network error or timeout)
  // Input: any coordinates
  // Expected behavior: the failure is logged
  // Expected output: null
  test.each([
    ['Network error', new TypeError('fetch failed')],
    ['Timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError')],
  ])('%s', async (_name, error) => {
    const fetchFn = fakeFetch(error);

    const weather = await createOpenWeatherService('test-key', fetchFn).getCurrentWeather(LATITUDE, LONGITUDE);

    expect(weather).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Could not get the current weather:', error);
  });

  // Mocked behavior: OpenWeather responds with a body that isn't the expected weather
  // Input: any coordinates
  // Expected behavior: the failure is logged
  // Expected output: null
  test.each([
    ['Invalid JSON', new Response('<html>', { status: 200 })],
    ['Missing temperature', jsonResponse({ weather: VANCOUVER.weather })],
    ['Missing conditions', jsonResponse({ main: VANCOUVER.main, weather: [] })],
  ])('%s', async (_name, response) => {
    const weather = await createOpenWeatherService('test-key', fakeFetch(response)).getCurrentWeather(LATITUDE, LONGITUDE);

    expect(weather).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  // Input: no OPENWEATHER_API_KEY (as in the tests)
  // Expected behavior: no request is attempted
  // Expected output: null
  test('Not configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    expect(await getWeatherService().getCurrentWeather(LATITUDE, LONGITUDE)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Input: OPENWEATHER_API_KEY is set
  // Expected behavior: the app-wide service calls OpenWeather with that key
  // Expected output: the current weather
  test('Configured from the environment', async () => {
    jest.replaceProperty(env, 'openWeatherApiKey', 'env-key');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(VANCOUVER));

    const weather = await getWeatherService().getCurrentWeather(LATITUDE, LONGITUDE);

    expect(weather?.condition).toBe('Rain');
    expect(new URL(String(fetchSpy.mock.calls[0]?.[0])).searchParams.get('appid')).toBe('env-key');
  });
});
