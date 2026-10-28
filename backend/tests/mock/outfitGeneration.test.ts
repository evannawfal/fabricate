import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import { Outfit } from '../../src/models/outfit.js';
import {
  OutfitGeneratorUnavailableError,
  setOutfitGenerator,
  type GeneratedOutfit,
  type OutfitGenerator,
  type OutfitRequest,
} from '../../src/services/outfitGenerator.js';
import { setWeatherService, type Weather, type WeatherService } from '../../src/services/weather.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

const app = createApp();

const UBC = { latitude: 49.26, longitude: -123.25 };
const LIGHT_RAIN: Weather = { temperatureC: 9, condition: 'Rain', description: 'light rain' };

// Stand-ins for the outfit generator (Claude API) and the weather service (OpenWeather).
function mockGenerator(result: GeneratedOutfit | Error) {
  const generate = jest.fn(async (_request: OutfitRequest) => {
    if (result instanceof Error) throw result;
    return result;
  });
  setOutfitGenerator({ generate } as OutfitGenerator);
  return generate;
}

function mockWeather(weather: Weather | null) {
  const getCurrentWeather = jest.fn(async (_latitude: number, _longitude: number) => weather);
  setWeatherService({ getCurrentWeather } as WeatherService);
  return getCurrentWeather;
}

// The tee in the wash bin must never be offered to the generator.
async function userWithCloset() {
  const user = await createUser();
  const shirt = await createClothingItem(user.id, { name: 'White shirt', category: 'top', color: 'white' });
  const jeans = await createClothingItem(user.id, { name: 'Black jeans', category: 'bottom', color: 'black' });
  const raincoat = await createClothingItem(user.id, { name: 'Olive raincoat', category: 'outerwear', color: 'olive' });
  const dirtyShirt = await createClothingItem(user.id, { name: 'Grey tee', category: 'top', isClean: false });
  return { user, shirt, jeans, raincoat, dirtyShirt };
}

function generate(userId: string, occasion = 'work') {
  return request(app).post('/outfits/generate').set('Authorization', authHeader(userId)).send({ occasion, ...UBC });
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
// The error handler logs failures; silence it, and let tests check what was logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setOutfitGenerator(undefined);
  setWeatherService(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /outfits/generate
describe('Mocked: POST /outfits/generate', () => {
  // Mocked behavior: OpenWeather reports light rain; the generator picks the raincoat, shirt and jeans
  // Input: occasion "work" and the user's coordinates
  // Expected status code: 200
  // Expected behavior: the generator gets the occasion, the weather and only the user's clean items; nothing is saved
  // Expected output: { outfit: { name, occasion, items }, weather } with the items in the generator's order
  test('Generates an outfit for the occasion and weather', async () => {
    const { user, shirt, jeans, raincoat } = await userWithCloset();
    const getCurrentWeather = mockWeather(LIGHT_RAIN);
    const generator = mockGenerator({ name: 'Rainy office day', itemIds: [raincoat.id, shirt.id, jeans.id] });

    const response = await generate(user.id);

    expect(response.status).toBe(200);
    expect(response.body.outfit).toMatchObject({ name: 'Rainy office day', occasion: 'work' });
    expect(response.body.outfit.items.map((item: { name: string }) => item.name)).toEqual([
      'Olive raincoat',
      'White shirt',
      'Black jeans',
    ]);
    expect(response.body.weather).toEqual(LIGHT_RAIN);
    expect(getCurrentWeather).toHaveBeenCalledWith(UBC.latitude, UBC.longitude);
    expect(generator).toHaveBeenCalledTimes(1);
    const sent = generator.mock.calls[0]?.[0] as OutfitRequest;
    expect(sent.occasion).toBe('work');
    expect(sent.weather).toEqual(LIGHT_RAIN);
    expect(sent.items.map((item) => item.name).sort()).toEqual(['Black jeans', 'Olive raincoat', 'White shirt']);
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Mocked behavior: OpenWeather can't be reached (the weather service returns null); the generator picks the shirt and jeans
  // Input: occasion "casual" and the user's coordinates (use case 2, failure 4b)
  // Expected status code: 200
  // Expected behavior: the outfit is generated without the weather
  // Expected output: the outfit, with weather null
  test('Weather unavailable', async () => {
    const { user, shirt, jeans } = await userWithCloset();
    mockWeather(null);
    const generator = mockGenerator({ name: 'Weekend basics', itemIds: [shirt.id, jeans.id] });

    const response = await generate(user.id, 'casual');

    expect(response.status).toBe(200);
    expect(response.body.weather).toBeNull();
    expect(response.body.outfit.items).toHaveLength(2);
    expect((generator.mock.calls[0]?.[0] as OutfitRequest).weather).toBeNull();
  });

  // Mocked behavior: the generator is unavailable (Claude is down, rate-limited or times out)
  // Input: occasion "work" and the user's coordinates (use case 2, failure 4a)
  // Expected status code: 503
  // Expected behavior: the error is logged; nothing is saved
  // Expected output: { error: "Outfit generation is not available right now" }
  test('Generator unavailable', async () => {
    const { user } = await userWithCloset();
    mockWeather(LIGHT_RAIN);
    mockGenerator(new OutfitGeneratorUnavailableError('Outfit generation is unavailable right now'));

    const response = await generate(user.id);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Outfit generation is not available right now' });
    expect(console.error).toHaveBeenCalledWith('Outfit generation failed:', 'Outfit generation is unavailable right now');
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Mocked behavior: ClothingItem.find throws while loading the user's clean clothes
  // Input: occasion "work" and the user's coordinates
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the generator is never called
  // Expected output: { error: "Internal server error" }
  test('Clothing DB error', async () => {
    const { user } = await userWithCloset();
    const generator = mockGenerator({ name: 'Look', itemIds: [] });
    jest.spyOn(ClothingItem, 'find').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await generate(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(generator).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });
});
