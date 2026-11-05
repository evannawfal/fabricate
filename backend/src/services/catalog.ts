import {
  CATALOG_CACHE_MAX_AGE_MS,
  CATALOG_CATEGORY_WORDS,
  CATALOG_COLOR_WORDS,
  CATALOG_DEPARTMENT_WORDS,
  CATALOG_REQUEST_TIMEOUT_MS,
  DEFAULT_CATALOG_COUNTRY,
  MAX_CATALOG_ITEMS,
  MAX_CATALOG_ITEMS_PER_STORE,
  SERPER_SHOPPING_URL,
} from '../config/constants.js';
import { env } from '../config/env.js';
import { CachedCatalogSearch } from '../models/cachedCatalogSearch.js';
import type { ClosetGap } from './closetGaps.js';

export interface CatalogItem {
  name: string;
  price: string;
  imageUrl: string;
  link: string;
  store: string;
}

export type CatalogDepartment = keyof typeof CATALOG_DEPARTMENT_WORDS;

export interface CatalogSearch extends Pick<ClosetGap, 'category' | 'colorFamily' | 'style'> {
  department?: CatalogDepartment | undefined;
  country?: string | undefined;
}

export interface CatalogService {
  search(search: CatalogSearch): Promise<CatalogItem[]>;
}

export interface CatalogProvider {
  find(term: string, country: string): Promise<CatalogItem[]>;
}

export class CatalogNotConfiguredError extends Error {
  constructor() {
    super('Store search is not configured (set SERPER_API_KEY)');
    this.name = 'CatalogNotConfiguredError';
  }
}

export class CatalogUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogUnavailableError';
  }
}

interface SerperResult {
  title?: unknown;
  price?: unknown;
  imageUrl?: unknown;
  link?: unknown;
  source?: unknown;
}

export function toSearchTerm({ category, colorFamily, style, department }: CatalogSearch): string {
  const words = [
    department === undefined ? undefined : CATALOG_DEPARTMENT_WORDS[department],
    style,
    colorFamily === undefined ? undefined : CATALOG_COLOR_WORDS[colorFamily],
    CATALOG_CATEGORY_WORDS[category],
  ];
  return words.filter((word) => word !== undefined).join(' ');
}

function toCatalogItem({ title, price, imageUrl, link, source }: SerperResult): CatalogItem | null {
  if (
    typeof title !== 'string' ||
    typeof price !== 'string' ||
    typeof imageUrl !== 'string' ||
    typeof link !== 'string' ||
    typeof source !== 'string'
  ) {
    return null;
  }
  return { name: title, price, imageUrl, link, store: source };
}

// Without the per-store cap, one big store can fill every slot.
function pickVariedItems(items: CatalogItem[]): CatalogItem[] {
  const pickedPerStore = new Map<string, number>();
  const picked = items.filter(({ store }) => {
    const count = pickedPerStore.get(store) ?? 0;
    pickedPerStore.set(store, count + 1);
    return count < MAX_CATALOG_ITEMS_PER_STORE;
  });
  return picked.slice(0, MAX_CATALOG_ITEMS);
}

async function requestShopping(
  apiKey: string,
  fetchFn: typeof fetch,
  term: string,
  country: string
): Promise<SerperResult[]> {
  const response = await fetchFn(SERPER_SHOPPING_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: term, gl: country }),
    signal: AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Serper responded with status ${response.status}`);
  }
  const { shopping } = (await response.json()) as { shopping?: unknown };
  if (!Array.isArray(shopping)) {
    throw new Error('Serper returned an unexpected response');
  }
  return shopping as SerperResult[];
}

export function createSerperProvider(apiKey: string, fetchFn: typeof fetch = fetch): CatalogProvider {
  return {
    async find(term, country) {
      try {
        const results = await requestShopping(apiKey, fetchFn, term, country);
        return pickVariedItems(results.map(toCatalogItem).filter((item) => item !== null));
      } catch (err) {
        throw new CatalogUnavailableError('Could not search the stores', { cause: err });
      }
    },
  };
}

export function createCatalogService(provider: CatalogProvider): CatalogService {
  return {
    async search(search) {
      const term = toSearchTerm(search);
      const country = search.country ?? DEFAULT_CATALOG_COUNTRY;
      const cached = await CachedCatalogSearch.findOne({ term, country }).lean();
      if (cached !== null && Date.now() - cached.fetchedAt.getTime() < CATALOG_CACHE_MAX_AGE_MS) {
        return cached.items;
      }

      let items: CatalogItem[];
      try {
        items = await provider.find(term, country);
      } catch (err) {
        if (cached === null) {
          throw err;
        }
        // Older results beat an error, e.g. once the search credits run out.
        console.error('Store search failed, using older results:', err);
        return cached.items;
      }
      await CachedCatalogSearch.updateOne({ term, country }, { items, fetchedAt: new Date() }, { upsert: true });
      return items;
    },
  };
}

const noCatalog: CatalogService = { search: () => Promise.reject(new CatalogNotConfiguredError()) };

let defaultCatalogService: CatalogService | undefined;

// undefined goes back to the service configured from the environment.
export function setCatalogService(service: CatalogService | undefined): void {
  defaultCatalogService = service;
}

export function getCatalogService(): CatalogService {
  defaultCatalogService ??=
    env.serperApiKey === undefined ? noCatalog : createCatalogService(createSerperProvider(env.serperApiKey));
  return defaultCatalogService;
}
