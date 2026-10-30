import request from 'supertest';

import { createApp } from '../../src/app.js';
import { Outfit } from '../../src/models/outfit.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

const app = createApp();

const UBC = { latitude: 49.26, longitude: -123.25 };

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

function generate(userId: string, body: unknown = { occasion: 'casual', ...UBC }) {
  return request(app).post('/outfits/generate').set('Authorization', authHeader(userId)).send(body as object);
}

// Interface POST /outfits/generate
describe('Unmocked: POST /outfits/generate', () => {
  // Input: a closet with a top and a bottom; the server has no ANTHROPIC_API_KEY (as in the tests)
  // Expected status code: 503
  // Expected behavior: nothing is generated or saved
  // Expected output: { error: "Outfit generation is not available right now" }
  test('Generation not configured', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { category: 'top' });
    await createClothingItem(user.id, { name: 'Jeans', category: 'bottom' });

    const response = await generate(user.id);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Outfit generation is not available right now' });
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Input: clean clothes missing a top, a bottom, or both (use case 2, failure 1a)
  // Expected status code: 400
  // Expected behavior: nothing is generated
  // Expected output: an error naming the missing categories, and the list of missing categories
  test.each([
    [['top'], ['bottom'], "Your clean clothes don't include a bottom. Add one to your closet or empty your wash bin."],
    [['bottom', 'shoes'], ['top'], "Your clean clothes don't include a top. Add one to your closet or empty your wash bin."],
    [[], ['top', 'bottom'], "Your clean clothes don't include a top or a bottom. Add one to your closet or empty your wash bin."],
  ] as const)('Closet with %j is missing %j', async (categories, missing, error) => {
    const user = await createUser();
    for (const category of categories) {
      await createClothingItem(user.id, { category });
    }

    const response = await generate(user.id);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error, missing });
  });

  // Input: a top, plus bottoms that are in the wash bin, archived, or another user's
  // Expected status code: 400
  // Expected behavior: only the user's clean, unarchived items count
  // Expected output: the bottom is reported as missing
  test('Only clean items in the closet count', async () => {
    const user = await createUser();
    const otherUser = await createUser();
    await createClothingItem(user.id, { category: 'top' });
    await createClothingItem(user.id, { name: 'Dirty jeans', category: 'bottom', isClean: false });
    await createClothingItem(user.id, { name: 'Old jeans', category: 'bottom', isArchived: true });
    await createClothingItem(otherUser.id, { name: 'Their jeans', category: 'bottom' });

    const response = await generate(user.id);

    expect(response.status).toBe(400);
    expect(response.body.missing).toEqual(['bottom']);
  });

  // Input: invalid request bodies
  // Expected status code: 400
  // Expected behavior: nothing is generated
  // Expected output: an error describing the problem
  test.each([
    [{ ...UBC }, /occasion must be one of: casual, work, formal, workout/],
    [{ occasion: 'party', ...UBC }, /occasion must be one of/],
    [{ occasion: 'work', longitude: UBC.longitude }, /latitude must be a number between -90 and 90/],
    [{ occasion: 'work', latitude: '49.26', longitude: UBC.longitude }, /latitude must be a number/],
    [{ occasion: 'work', latitude: 91, longitude: UBC.longitude }, /latitude must be a number between -90 and 90/],
    [{ occasion: 'work', latitude: UBC.latitude, longitude: -181 }, /longitude must be a number between -180 and 180/],
    [{ occasion: 'work', ...UBC, weather: 'sunny' }, /Unknown field: weather/],
    [['work'], /Request body must be a JSON object/],
  ])('Invalid body %j', async (body, expectedError) => {
    const user = await createUser();

    const response = await generate(user.id, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).post('/outfits/generate').send({ occasion: 'casual', ...UBC });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });
});
