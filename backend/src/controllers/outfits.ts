import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem, type ClothingItemResponse } from '../models/clothingItem.js';
import { toClothingItemResponsesWithImages } from '../services/clothingImages.js';
import { Outfit, toOutfitResponse, type OutfitDocument, type OutfitResponse } from '../models/outfit.js';
import { isObjectId } from '../validation/common.js';
import { validateOutfitInput, validateOutfitUpdate } from '../validation/outfit.js';

const INVALID_ID = { error: 'Invalid outfit id' };
const NOT_FOUND = { error: 'Outfit not found' };
const ITEMS_NOT_OWNED = { error: 'All items must be clothing items in your closet' };

// Items must be in the user's closet. Archived items are only allowed if the outfit already had them.
async function ownsAllItems(userId: string, itemIds: string[], existingItemIds: string[] = []): Promise<boolean> {
  const count = await ClothingItem.countDocuments({
    _id: { $in: itemIds },
    owner: userId,
    $or: [{ isArchived: false }, { _id: { $in: existingItemIds } }],
  });
  return count === itemIds.length;
}

// Loads every referenced clothing item in one query and keeps each outfit's item order.
async function toOutfitResponses(userId: string, outfits: OutfitDocument[]): Promise<OutfitResponse[]> {
  const itemIds = outfits.flatMap((outfit) => outfit.items);
  const items = await ClothingItem.find({ _id: { $in: itemIds }, owner: userId });
  const itemResponses = await toClothingItemResponsesWithImages(items);
  const itemsById = new Map(itemResponses.map((item) => [item.id, item]));
  return outfits.map((outfit) => {
    const outfitItems = outfit.items
      .map((itemId) => itemsById.get(itemId.toString()))
      .filter((item): item is ClothingItemResponse => item !== undefined);
    return toOutfitResponse(outfit, outfitItems);
  });
}

async function toSingleOutfitResponse(userId: string, outfit: OutfitDocument): Promise<OutfitResponse> {
  const [response] = await toOutfitResponses(userId, [outfit]);
  if (!response) {
    throw new Error('Failed to build outfit response');
  }
  return response;
}

// POST /outfits
export async function createOutfit(req: AuthedRequest, res: Response) {
  const input = validateOutfitInput(req.body);
  if (!input.ok) {
    return res.status(400).json({ error: input.error });
  }
  const userId = getUserId(req);
  if (!(await ownsAllItems(userId, input.value.items))) {
    return res.status(400).json(ITEMS_NOT_OWNED);
  }
  const outfit = await Outfit.create({ owner: userId, ...input.value, source: 'manual' });
  res.status(201).json(await toSingleOutfitResponse(userId, outfit));
}

// GET /outfits
export async function listOutfits(req: AuthedRequest, res: Response) {
  const userId = getUserId(req);
  const outfits = await Outfit.find({ owner: userId }).sort({ createdAt: -1, _id: -1 });
  res.json({ outfits: await toOutfitResponses(userId, outfits) });
}

// GET /outfits/:id
export async function getOutfit(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const userId = getUserId(req);
  const outfit = await Outfit.findOne({ _id: id, owner: userId });
  if (!outfit) {
    return res.status(404).json(NOT_FOUND);
  }
  res.json(await toSingleOutfitResponse(userId, outfit));
}

// PATCH /outfits/:id
export async function updateOutfit(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const update = validateOutfitUpdate(req.body);
  if (!update.ok) {
    return res.status(400).json({ error: update.error });
  }
  const userId = getUserId(req);
  const existing = await Outfit.findOne({ _id: id, owner: userId });
  if (!existing) {
    return res.status(404).json(NOT_FOUND);
  }
  const existingItemIds = existing.items.map((itemId) => itemId.toString());
  if (update.value.items !== undefined && !(await ownsAllItems(userId, update.value.items, existingItemIds))) {
    return res.status(400).json(ITEMS_NOT_OWNED);
  }
  const outfit = await Outfit.findOneAndUpdate(
    { _id: id, owner: userId },
    { $set: update.value },
    { returnDocument: 'after', runValidators: true }
  );
  if (!outfit) {
    return res.status(404).json(NOT_FOUND);
  }
  res.json(await toSingleOutfitResponse(userId, outfit));
}

// DELETE /outfits/:id
export async function deleteOutfit(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const outfit = await Outfit.findOneAndDelete({ _id: id, owner: getUserId(req) });
  if (!outfit) {
    return res.status(404).json(NOT_FOUND);
  }
  res.status(204).end();
}
