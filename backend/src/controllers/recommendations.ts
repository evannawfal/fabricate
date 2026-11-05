import type { Response } from 'express';
import { REQUIRED_CLOSET_CATEGORIES } from '../config/constants.js';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem, type ClothingItemDocument, type ClothingItemResponse } from '../models/clothingItem.js';
import { getCatalogService, type CatalogItem, type CatalogSearch } from '../services/catalog.js';
import { analyzeClosetGaps, type ClosetGap } from '../services/closetGaps.js';
import { toClothingItemResponsesWithImages } from '../services/clothingImages.js';
import { validateRecommendationQuery, type RecommendationQuery } from '../validation/recommendations.js';

export interface StoreItem extends CatalogItem {
  reason: string;
  pairsWith: ClothingItemResponse[];
}

const MISSING_BASICS_ERROR = 'Add at least one top and one bottom to your closet to get recommendations';

function toCatalogSearch(gap: ClosetGap, query: RecommendationQuery): CatalogSearch {
  const search: CatalogSearch = { category: gap.category, ...query };
  if (gap.colorFamily !== undefined) {
    search.colorFamily = gap.colorFamily;
  }
  if (gap.style !== undefined) {
    search.style = gap.style;
  }
  return search;
}

async function loadPairedItems(gaps: ClosetGap[], closet: ClothingItemDocument[]): Promise<Map<string, ClothingItemResponse>> {
  const pairedIds = new Set(gaps.flatMap((gap) => gap.pairsWith));
  const paired = closet.filter((item) => pairedIds.has(item._id.toString()));
  const responses = await toClothingItemResponsesWithImages(paired);
  return new Map(responses.map((item) => [item.id, item]));
}

// Two gaps' searches can return the same product, and the Shop screen should list it once.
function withoutRepeatedLinks(items: StoreItem[]): StoreItem[] {
  const seenLinks = new Set<string>();
  return items.filter(({ link }) => {
    if (seenLinks.has(link)) {
      return false;
    }
    seenLinks.add(link);
    return true;
  });
}

// GET /recommendations?country=&department=
export async function getRecommendations(req: AuthedRequest, res: Response) {
  const query = validateRecommendationQuery(req.query);
  if (!query.ok) {
    return res.status(400).json({ error: query.error });
  }
  // Clothes in the wash bin are still in the closet, so they count. Newest first, like the closet
  // screen, so the same closet always gets the same pairings.
  const closet = await ClothingItem.find({ owner: getUserId(req), isArchived: false }).sort({ createdAt: -1, _id: -1 });
  const missing = REQUIRED_CLOSET_CATEGORIES.filter((category) => !closet.some((item) => item.category === category));
  if (missing.length > 0) {
    return res.status(400).json({ error: MISSING_BASICS_ERROR, missing });
  }

  const gaps = analyzeClosetGaps(
    closet.map(({ _id, category, color, style }) => ({ id: _id.toString(), category, color, style }))
  );
  const catalog = getCatalogService();
  const searches = await Promise.all(
    gaps.map(async (gap) => ({ gap, found: await catalog.search(toCatalogSearch(gap, query.value)) }))
  );
  const pairedItems = await loadPairedItems(gaps, closet);
  const items = searches.flatMap(({ gap, found }) =>
    found.map((item) => ({
      ...item,
      reason: gap.reason,
      // Every paired id comes from the closet, so the filter only narrows the type.
      pairsWith: gap.pairsWith
        .map((id) => pairedItems.get(id))
        .filter((paired): paired is ClothingItemResponse => paired !== undefined),
    }))
  );
  res.json({ gaps: gaps.map((gap) => gap.reason), items: withoutRepeatedLinks(items) });
}
