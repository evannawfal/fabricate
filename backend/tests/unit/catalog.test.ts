import { jest } from '@jest/globals';

import {
  CATALOG_CACHE_MAX_AGE_MS,
  MAX_CATALOG_ITEMS,
  MAX_CATALOG_ITEMS_PER_STORE,
  SERPER_SHOPPING_URL,
} from '../../src/config/constants.js';
import { env } from '../../src/config/env.js';
import { CachedCatalogSearch } from '../../src/models/cachedCatalogSearch.js';
import {
  CatalogNotConfiguredError,
  CatalogUnavailableError,
  createCatalogService,
  createSerperProvider,
  getCatalogService,
  setCatalogService,
  toSearchTerm,
  type CatalogItem,
  type CatalogProvider,
  type CatalogService,
} from '../../src/services/catalog.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';

const BLACK_PANTS = { category: 'bottom', colorFamily: 'neutral', style: 'casual', department: 'mens' } as const;
const BLACK_PANTS_TERM = "men's casual black pants";
const CHINOS: CatalogItem = {
  name: "Old Navy Men's Straight Rotation Chino Pants",
  price: '$24.99',
  imageUrl: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:chinos',
  link: 'https://www.google.com/search?ibp=oshop&q=casual+black+pants',
  store: 'Old Navy Canada',
};

// Trimmed-down result from a real Serper shopping search.
function serperResult(overrides: Record<string, unknown> = {}) {
  return {
    title: CHINOS.name,
    source: CHINOS.store,
    link: CHINOS.link,
    price: CHINOS.price,
    imageUrl: CHINOS.imageUrl,
    rating: 4.5,
    ratingCount: 120,
    productId: '9668658465929965493',
    position: 1,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// A stand-in for fetch: nothing is sent to Serper.
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

function fakeProvider(items: CatalogItem[] = [CHINOS]) {
  const find = jest.fn<CatalogProvider['find']>().mockResolvedValue(items);
  return { provider: { find }, find };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function storeResults(count: number, store: (index: number) => string) {
  return Array.from({ length: count }, (_, index) => serperResult({ title: `Item ${index}`, source: store(index) }));
}

describe('Catalog search terms', () => {
  // Input: a gap with a colour family and style, for the men's department
  // Expected output: the department, style, a real colour and a shoppable word for the category
  test('Uses every part of the search', () => {
    expect(toSearchTerm(BLACK_PANTS)).toBe(BLACK_PANTS_TERM);
  });

  // Input: the warm and cool colour families
  // Expected output: real colours, because Google misreads "warm" and "cool"
  test('Turns colour families into colours', () => {
    expect(toSearchTerm({ category: 'top', colorFamily: 'warm', style: 'casual' })).toBe('casual burgundy shirt');
    expect(toSearchTerm({ category: 'outerwear', colorFamily: 'cool', style: 'outdoor' })).toBe('outdoor blue jacket');
  });

  // Input: a gap with only a category, as for a closet with nothing to pair with
  // Expected output: only the category word
  test('Leaves out what the gap does not have', () => {
    expect(toSearchTerm({ category: 'shoes' })).toBe('shoes');
  });
});

describe('Serper provider', () => {
  // Mocked behavior: Serper returns one result
  // Input: a search term and country
  // Expected behavior: one POST with the API key in a header, and the term and country in the body
  // Expected output: the result in our format, without Serper's other fields
  test('Searches and normalizes the results', async () => {
    const fetchFn = fakeFetch(jsonResponse({ shopping: [serperResult()], credits: 2 }));

    const items = await createSerperProvider('test-key', fetchFn).find(BLACK_PANTS_TERM, 'ca');

    expect(items).toEqual([CHINOS]);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(SERPER_SHOPPING_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'X-API-KEY': 'test-key' });
    expect(JSON.parse(String(init?.body))).toEqual({ q: BLACK_PANTS_TERM, gl: 'ca' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  // Mocked behavior: Serper leaves the link out of one result, which about 1 in 6 real results do
  // Input: a search term and country
  // Expected output: only the result that can be opened
  test('Skips results with a missing field', async () => {
    const shopping = [serperResult({ link: undefined }), serperResult({ title: 'Has a link' })];

    const items = await createSerperProvider('test-key', fakeFetch(jsonResponse({ shopping }))).find('shoes', 'ca');

    expect(items.map(({ name }) => name)).toEqual(['Has a link']);
  });

  // Mocked behavior: every result comes from one store
  // Input: a search term and country
  // Expected output: only as many as one store is allowed, in Serper's order
  test('Limits how many results come from one store', async () => {
    const shopping = storeResults(10, () => 'Fashion Nova');

    const items = await createSerperProvider('test-key', fakeFetch(jsonResponse({ shopping }))).find('shoes', 'ca');

    expect(items).toHaveLength(MAX_CATALOG_ITEMS_PER_STORE);
    expect(items[0]?.name).toBe('Item 0');
  });

  // Mocked behavior: Serper returns 40 results from 40 stores, as it does for a real search
  // Input: a search term and country
  // Expected output: the first results, up to the limit
  test('Limits how many results are kept', async () => {
    const shopping = storeResults(40, (index) => `Store ${index}`);

    const items = await createSerperProvider('test-key', fakeFetch(jsonResponse({ shopping }))).find('shoes', 'ca');

    expect(items).toHaveLength(MAX_CATALOG_ITEMS);
    expect(items[MAX_CATALOG_ITEMS - 1]?.name).toBe(`Item ${MAX_CATALOG_ITEMS - 1}`);
  });

  // Mocked behavior: Serper refuses the request
  // Input: a search term and country
  // Expected behavior: the status is kept as the cause, for the server logs
  test('Keeps the reason for a rejected request', async () => {
    const provider = createSerperProvider('test-key', fakeFetch(jsonResponse({ message: 'Unauthorized' }, 403)));

    await expect(provider.find('shoes', 'ca')).rejects.toMatchObject({
      cause: new Error('Serper responded with status 403'),
    });
  });

  // Mocked behavior: Serper finds nothing
  // Input: a search term and country
  // Expected output: an empty list, not a failure (use case 4, failure 3a)
  test('Returns nothing when nothing matches', async () => {
    const provider = createSerperProvider('test-key', fakeFetch(jsonResponse({ shopping: [] })));

    await expect(provider.find('shoes', 'ca')).resolves.toEqual([]);
  });

  // Mocked behavior: the request fails in each way it can
  // Input: a search term and country
  // Expected behavior: the same error each time, so callers handle one failure (use case 4, failure 3b)
  test.each([
    ['a rejected request', () => jsonResponse({ message: 'Not enough credits' }, 403)],
    ['a timeout', () => new DOMException('The operation timed out', 'TimeoutError')],
    ['a body without results', () => jsonResponse({ message: 'Unexpected' })],
    ['a body that is not JSON', () => new Response('<html>Bad gateway</html>')],
    ['a result that is not an object', () => jsonResponse({ shopping: [null] })],
  ])('Reports %s as unavailable', async (_name, result) => {
    const provider = createSerperProvider('test-key', fakeFetch(result() as Response));

    await expect(provider.find('shoes', 'ca')).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe('Cached catalog search', () => {
  beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  // Mocked behavior: the provider returns one item
  // Input: the same search twice, the second through a new service, as after a server restart
  // Expected behavior: the provider is searched once, which is what saves the search credits
  // Expected output: the same item both times
  test('Reuses results across searches and restarts', async () => {
    const { provider, find } = fakeProvider();

    const first = await createCatalogService(provider).search(BLACK_PANTS);
    const second = await createCatalogService(provider).search(BLACK_PANTS);

    expect(first).toEqual([CHINOS]);
    expect(second).toEqual([CHINOS]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(BLACK_PANTS_TERM, 'ca');
  });

  // Mocked behavior: the provider returns one item
  // Input: the same gap in two countries and for two departments
  // Expected behavior: each is searched separately, because their results differ
  test('Keeps countries and departments apart', async () => {
    const { provider, find } = fakeProvider();
    const service = createCatalogService(provider);

    await service.search({ ...BLACK_PANTS, country: 'ca' });
    await service.search({ ...BLACK_PANTS, country: 'us' });
    await service.search({ ...BLACK_PANTS, country: 'ca', department: 'womens' });

    expect(find.mock.calls).toEqual([
      [BLACK_PANTS_TERM, 'ca'],
      [BLACK_PANTS_TERM, 'us'],
      ["women's casual black pants", 'ca'],
    ]);
  });

  // Mocked behavior: the provider returns one item
  // Input: results saved just inside the cache's maximum age
  // Expected behavior: they're still used
  test('Uses results that are not too old', async () => {
    const { provider, find } = fakeProvider();
    await CachedCatalogSearch.create({
      term: BLACK_PANTS_TERM,
      country: 'ca',
      items: [CHINOS],
      fetchedAt: new Date(Date.now() - CATALOG_CACHE_MAX_AGE_MS + 60_000),
    });

    await createCatalogService(provider).search(BLACK_PANTS);

    expect(find).not.toHaveBeenCalled();
  });

  // Mocked behavior: the provider returns a newer item
  // Input: results saved 8 days ago
  // Expected behavior: the store is searched again and the saved results are replaced
  // Expected output: the newer item
  test('Refreshes old results', async () => {
    const newer = { ...CHINOS, name: 'Newer chinos' };
    const { provider } = fakeProvider([newer]);
    await CachedCatalogSearch.create({ term: BLACK_PANTS_TERM, country: 'ca', items: [CHINOS], fetchedAt: daysAgo(8) });

    await expect(createCatalogService(provider).search(BLACK_PANTS)).resolves.toEqual([newer]);

    const saved = await CachedCatalogSearch.find({ term: BLACK_PANTS_TERM }).lean();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.items[0]?.name).toBe('Newer chinos');
    expect(saved[0]?.fetchedAt.getTime()).toBeGreaterThan(daysAgo(1).getTime());
  });

  // Mocked behavior: the provider fails, as it would with no credits left
  // Input: results saved 8 days ago
  // Expected behavior: the failure is logged and the old results stay saved
  // Expected output: the old results rather than an error
  test('Falls back to old results when the search fails', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider, find } = fakeProvider();
    find.mockRejectedValue(new CatalogUnavailableError('Could not search the stores'));
    const fetchedAt = daysAgo(8);
    await CachedCatalogSearch.create({ term: BLACK_PANTS_TERM, country: 'ca', items: [CHINOS], fetchedAt });

    await expect(createCatalogService(provider).search(BLACK_PANTS)).resolves.toEqual([CHINOS]);

    expect(log).toHaveBeenCalledTimes(1);
    expect((await CachedCatalogSearch.findOne({ term: BLACK_PANTS_TERM }).lean())?.fetchedAt).toEqual(fetchedAt);
    log.mockRestore();
  });

  // Mocked behavior: the provider fails
  // Input: a search with nothing saved
  // Expected behavior: the failure reaches the caller (use case 4, failure 3b) and nothing is saved
  test('Reports a failure when there is nothing to fall back to', async () => {
    const { provider, find } = fakeProvider();
    find.mockRejectedValue(new CatalogUnavailableError('Could not search the stores'));

    await expect(createCatalogService(provider).search(BLACK_PANTS)).rejects.toBeInstanceOf(CatalogUnavailableError);

    await expect(CachedCatalogSearch.countDocuments()).resolves.toBe(0);
  });

  // Mocked behavior: the provider finds nothing
  // Input: the same search twice
  // Expected behavior: an empty result is remembered too, so it doesn't spend a credit every time
  // Expected output: an empty list both times
  test('Remembers searches that found nothing', async () => {
    const { provider, find } = fakeProvider([]);
    const service = createCatalogService(provider);

    await expect(service.search(BLACK_PANTS)).resolves.toEqual([]);
    await expect(service.search(BLACK_PANTS)).resolves.toEqual([]);

    expect(find).toHaveBeenCalledTimes(1);
  });

  // Mocked behavior: the provider returns one item
  // Input: two users starting the same search at the same moment
  // Expected behavior: neither fails on the unique index, and one set of results is saved
  test('Handles the same search running twice at once', async () => {
    const { provider } = fakeProvider();
    const service = createCatalogService(provider);

    const results = await Promise.all([service.search(BLACK_PANTS), service.search(BLACK_PANTS)]);

    expect(results).toEqual([[CHINOS], [CHINOS]]);
    await expect(CachedCatalogSearch.countDocuments()).resolves.toBe(1);
  });
});

describe('Default catalog service', () => {
  beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
  afterEach(async () => {
    setCatalogService(undefined);
    jest.restoreAllMocks();
    await clearTestDatabase();
  });
  afterAll(stopTestDatabase);

  // Input: no SERPER_API_KEY, which is how the tests run
  // Expected behavior: searching reports that store search is not configured
  test('Needs an API key', async () => {
    expect(env.serperApiKey).toBeUndefined();

    await expect(getCatalogService().search(BLACK_PANTS)).rejects.toBeInstanceOf(CatalogNotConfiguredError);
  });

  // Mocked behavior: global fetch returns one Serper result
  // Input: a search with SERPER_API_KEY set, which is how the server runs
  // Expected behavior: Serper is searched with that key
  // Expected output: the normalized result
  test('Searches Serper with the key from the environment', async () => {
    jest.replaceProperty(env, 'serperApiKey', 'env-key');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ shopping: [serperResult()] }));

    await expect(getCatalogService().search(BLACK_PANTS)).resolves.toEqual([CHINOS]);

    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-API-KEY': 'env-key' });
  });

  // Input: a stand-in set with setCatalogService
  // Expected behavior: it replaces the default until it's cleared
  test('Can be replaced', () => {
    const standIn: CatalogService = { search: () => Promise.resolve([]) };

    setCatalogService(standIn);
    expect(getCatalogService()).toBe(standIn);

    setCatalogService(undefined);
    expect(getCatalogService()).not.toBe(standIn);
  });
});
