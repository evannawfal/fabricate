import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem, toClothingItemResponse } from '../models/clothingItem.js';
import { validateClothingItemFilter, validateClothingItemUpdate } from '../validation/clothing.js';
import { isObjectId } from '../validation/common.js';

const INVALID_ID = { error: 'Invalid clothing item id' };
const NOT_FOUND = { error: 'Clothing item not found' };
const ARCHIVED = { error: 'Clothing item is archived and can no longer be edited' };

// GET /clothing?category=&clean=
export async function listClothingItems(req: AuthedRequest, res: Response) {
  const filter = validateClothingItemFilter(req.query);
  if (!filter.ok) {
    return res.status(400).json({ error: filter.error });
  }
  const items = await ClothingItem.find({ owner: getUserId(req), isArchived: false, ...filter.value }).sort({
    createdAt: -1,
    _id: -1,
  });
  res.json({ items: items.map(toClothingItemResponse) });
}

// GET /clothing/:id
export async function getClothingItem(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const item = await ClothingItem.findOne({ _id: id, owner: getUserId(req) });
  if (!item) {
    return res.status(404).json(NOT_FOUND);
  }
  res.json(toClothingItemResponse(item));
}

// PATCH /clothing/:id
export async function updateClothingItem(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const update = validateClothingItemUpdate(req.body);
  if (!update.ok) {
    return res.status(400).json({ error: update.error });
  }
  const userId = getUserId(req);
  const item = await ClothingItem.findOneAndUpdate(
    { _id: id, owner: userId, isArchived: false },
    { $set: update.value },
    { returnDocument: 'after', runValidators: true }
  );
  if (!item) {
    const archived = await ClothingItem.exists({ _id: id, owner: userId, isArchived: true });
    return archived ? res.status(409).json(ARCHIVED) : res.status(404).json(NOT_FOUND);
  }
  res.json(toClothingItemResponse(item));
}

// DELETE /clothing/:id — archives the item: it leaves the closet but past outfits keep showing it.
export async function deleteClothingItem(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const item = await ClothingItem.findOneAndUpdate(
    { _id: id, owner: getUserId(req), isArchived: false },
    { $set: { isArchived: true, archivedAt: new Date() } }
  );
  if (!item) {
    return res.status(404).json(NOT_FOUND);
  }
  res.status(204).end();
}
