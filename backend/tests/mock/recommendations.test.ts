import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import {
  CatalogUnavailableError,
  setCatalogService,
  type CatalogItem,
  type CatalogService,
} from '../../src/services/catalog.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

const app = createApp();

function storeItem(name: string, store = 'Uniqlo'): CatalogItem {
  const slug = name.toLowerCase().replaceAll(' ', '-');
  return {
    name,
    price: '$49.90',
    imageUrl: `https://images.example.com/${slug}.jpg`,
    link: `https://shopping.example.com/${slug}`,
    store,
  };
}

const SNEAKERS = storeItem('Black canvas sneakers');
const JACKET = storeItem('Black denim jacket', 'Gap');

// Stand-in for the store search (Serper), answering each search by the category it asks for.
function mockCatalog(results: Partial<Record<string, CatalogItem[] | Error>>) {
  const search = jest.fn<CatalogService['search']>((search) => {
    const result = results[search.category] ?? [];
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
  setCatalogService({ search });
  return search;
}

// Missing shoes and outerwear, so the analysis finds two gaps that pair with both items.
async function userWithShirtAndJeans() {
  const user = await createUser();
  const shirt = await createClothingItem(user.id, { name: 'White shirt', category: 'top', color: 'white' });
  const jeans = await createClothingItem(user.id, { name: 'Black jeans', category: 'bottom', color: 'black' });
  return { user, shirt, jeans };
}

function recommend(userId: string, query = '') {
  return request(app).get(`/recommendations${query}`).set('Authorization', authHeader(userId));
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
// The error handler logs failures; silence it, and let tests check what was logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setCatalogService(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface GET /recommendations
describe('Mocked: GET /recommendations', () => {
  // Mocked behavior: the store search returns sneakers for shoes and a jacket for outerwear
  // Input: a closet with a shirt and jeans; country US and department womens
  // Expected status code: 200
  // Expected behavior: one search per gap, each with the gap's look and the user's country and department
  // Expected output: both gaps, and each store item with its gap's reason and the closet items it pairs with
  test('Recommends store items for each gap', async () => {
    const { user, shirt, jeans } = await userWithShirtAndJeans();
    const search = mockCatalog({ shoes: [SNEAKERS], outerwear: [JACKET] });

    const response = await recommend(user.id, '?country=US&department=womens');

    expect(response.status).toBe(200);
    expect(response.body.gaps).toEqual(['No shoes in your closet', 'No outerwear in your closet']);
    expect(response.body.items).toEqual([
      expect.objectContaining({ ...SNEAKERS, reason: 'No shoes in your closet' }),
      expect.objectContaining({ ...JACKET, reason: 'No outerwear in your closet' }),
    ]);
    for (const item of response.body.items as { pairsWith: { id: string; name: string }[] }[]) {
      expect(item.pairsWith).toEqual([
        expect.objectContaining({ id: jeans.id, name: 'Black jeans' }),
        expect.objectContaining({ id: shirt.id, name: 'White shirt' }),
      ]);
    }
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledWith({ category: 'shoes', colorFamily: 'neutral', style: 'casual', country: 'us', department: 'womens' });
    expect(search).toHaveBeenCalledWith({ category: 'outerwear', colorFamily: 'neutral', style: 'casual', country: 'us', department: 'womens' });
  });

  // Mocked behavior: the store search returns sneakers for shoes
  // Input: a closet with a shirt and jeans, and no country or department
  // Expected status code: 200
  // Expected behavior: the searches leave the country to the catalog's default (Canada) and search all clothing
  // Expected output: the sneakers
  test('Searches without a country or department when none is given', async () => {
    const { user } = await userWithShirtAndJeans();
    const search = mockCatalog({ shoes: [SNEAKERS] });

    const response = await recommend(user.id);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([expect.objectContaining(SNEAKERS)]);
    expect(search).toHaveBeenCalledWith({ category: 'shoes', colorFamily: 'neutral', style: 'casual' });
  });

  // Mocked behavior: the store search returns sneakers for shoes
  // Input: a closet with a top and a bottom in a colour the analysis doesn't recognise
  // Expected status code: 200
  // Expected behavior: the gaps have no look to match, so each search only names the category
  // Expected output: the sneakers, paired with nothing
  test('Searches by category alone when nothing in the closet pairs with the gap', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { category: 'top', color: 'plaid' });
    await createClothingItem(user.id, { category: 'bottom', color: 'plaid' });
    const search = mockCatalog({ shoes: [SNEAKERS] });

    const response = await recommend(user.id);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([{ ...SNEAKERS, reason: 'No shoes in your closet', pairsWith: [] }]);
    expect(search).toHaveBeenCalledWith({ category: 'shoes' });
    expect(search).toHaveBeenCalledWith({ category: 'outerwear' });
  });

  // Mocked behavior: the store search finds nothing for any gap
  // Input: a closet with a shirt and jeans
  // Expected status code: 200
  // Expected behavior: the gaps are still returned (use case 4, failure 3a)
  // Expected output: both gaps and no items
  test('Returns the gaps when the stores have no matching items', async () => {
    const { user } = await userWithShirtAndJeans();
    mockCatalog({});

    const response = await recommend(user.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ gaps: ['No shoes in your closet', 'No outerwear in your closet'], items: [] });
  });

  // Mocked behavior: the store search returns the same product for shoes and for outerwear
  // Input: a closet with a shirt and jeans
  // Expected status code: 200
  // Expected behavior: products are matched by link, and only the first gap's copy is kept
  // Expected output: the product once, with the shoes gap's reason
  test('Lists a product found for two gaps once', async () => {
    const { user } = await userWithShirtAndJeans();
    mockCatalog({ shoes: [SNEAKERS], outerwear: [SNEAKERS, JACKET] });

    const response = await recommend(user.id);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({ link: SNEAKERS.link, reason: 'No shoes in your closet' }),
      expect.objectContaining({ link: JACKET.link, reason: 'No outerwear in your closet' }),
    ]);
  });

  // Mocked behavior: the store search fails for outerwear (Serper is down and nothing is cached)
  // Input: a closet with a shirt and jeans
  // Expected status code: 503
  // Expected behavior: the failure is logged and no partial results are returned (use case 4, failure 3b)
  // Expected output: { error: "Store search is not available right now" }
  test('Store search unavailable', async () => {
    const { user } = await userWithShirtAndJeans();
    mockCatalog({ shoes: [SNEAKERS], outerwear: new CatalogUnavailableError('Could not search the stores') });

    const response = await recommend(user.id);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Store search is not available right now' });
    expect(console.error).toHaveBeenCalledWith('Store search failed:', 'Could not search the stores');
  });

  // Mocked behavior: the store search throws an unexpected error
  // Input: a closet with a shirt and jeans
  // Expected status code: 500
  // Expected behavior: the error is logged
  // Expected output: { error: "Internal server error" }
  test('Unexpected store search error', async () => {
    const { user } = await userWithShirtAndJeans();
    mockCatalog({ shoes: new Error('Unexpected') });

    const response = await recommend(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });

  // Mocked behavior: ClothingItem.find throws (the Clothing DB is unavailable)
  // Input: any user
  // Expected status code: 500
  // Expected behavior: the error is logged and no store is searched
  // Expected output: { error: "Internal server error" }
  test('Database error while loading the closet', async () => {
    const user = await createUser();
    const search = mockCatalog({});
    jest.spyOn(ClothingItem, 'find').mockImplementation(() => {
      throw new Error('Database unavailable');
    });

    const response = await recommend(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(search).not.toHaveBeenCalled();
  });
});
