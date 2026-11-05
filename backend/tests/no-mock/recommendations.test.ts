import request from 'supertest';

import { createApp } from '../../src/app.js';
import { CachedCatalogSearch } from '../../src/models/cachedCatalogSearch.js';
import type { ClothingCategory } from '../../src/models/clothingItem.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

const app = createApp();

const MISSING_BASICS_ERROR = 'Add at least one top and one bottom to your closet to get recommendations';

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

function recommend(userId: string, query = '') {
  return request(app).get(`/recommendations${query}`).set('Authorization', authHeader(userId));
}

// Interface GET /recommendations
describe('Unmocked: GET /recommendations', () => {
  // Input: a request without an Authorization header
  // Expected status code: 401
  // Expected behavior: the closet isn't read
  // Expected output: an error
  test('Requires sign-in', async () => {
    const response = await request(app).get('/recommendations');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });

  // Input: a closet missing a top, a bottom, or both (use case 4, failure 2a)
  // Expected status code: 400
  // Expected behavior: no gap analysis or store search is done
  // Expected output: an error asking for a top and a bottom, and the list of missing categories
  test.each([
    [['top'], ['bottom']],
    [['bottom', 'shoes'], ['top']],
    [[], ['top', 'bottom']],
  ] as [ClothingCategory[], string[]][])('Closet with %j is missing %j', async (categories, missing) => {
    const user = await createUser();
    for (const category of categories) {
      await createClothingItem(user.id, { category });
    }

    const response = await recommend(user.id);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: MISSING_BASICS_ERROR, missing });
  });

  // Input: a closet whose only bottom has been removed (archived)
  // Expected status code: 400
  // Expected behavior: removed items aren't part of the closet
  // Expected output: bottom is missing
  test('Ignores removed items', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { category: 'top' });
    await createClothingItem(user.id, { category: 'bottom', isArchived: true });

    const response = await recommend(user.id);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: MISSING_BASICS_ERROR, missing: ['bottom'] });
  });

  // Input: a country that isn't a two-letter code, a repeated country, or an unknown department
  // Expected status code: 400
  // Expected behavior: the closet isn't analyzed
  // Expected output: an error naming the invalid parameter
  test.each([
    ['?country=canada', 'country must be a two-letter country code'],
    ['?country=c1', 'country must be a two-letter country code'],
    ['?country=ca&country=us', 'country must be a two-letter country code'],
    ['?department=kids', 'department must be one of: mens, womens'],
  ])('Rejects %s', async (query, error) => {
    const user = await createUser();

    const response = await recommend(user.id, query);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
  });

  // Input: a small closet with every everyday category, the top in the wash bin, in a colour
  // the analysis doesn't recognise, so there is nothing to pair a new item with
  // Expected status code: 200
  // Expected behavior: clothes in the wash bin count; no gaps are found, so no store is searched
  // Expected output: { gaps: [], items: [] }
  test('Returns no recommendations when the closet has no gaps', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { category: 'top', color: 'plaid', isClean: false });
    for (const category of ['bottom', 'shoes', 'outerwear'] as const) {
      await createClothingItem(user.id, { category, color: 'plaid' });
    }

    const response = await recommend(user.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ gaps: [], items: [] });
    expect(await CachedCatalogSearch.countDocuments()).toBe(0);
  });

  // Input: a closet with only a top and a bottom; the server has no SERPER_API_KEY (as in the tests)
  // Expected status code: 503
  // Expected behavior: the gaps are found, but the store search isn't available (use case 4, failure 3b)
  // Expected output: { error: "Store search is not available right now" }
  test('Store search not configured', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { category: 'top' });
    await createClothingItem(user.id, { name: 'Jeans', category: 'bottom' });

    const response = await recommend(user.id, '?country=US&department=womens');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Store search is not available right now' });
  });
});
