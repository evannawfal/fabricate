import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem, toClothingItemResponse } from '../models/clothingItem.js';
import { Outfit } from '../models/outfit.js';
import { validateClothingItemFilter, validateClothingItemUpdate } from '../validation/clothing.js';
import { isObjectId } from '../validation/common.js';

const INVALID_ID = { error: 'Invalid clothing item id' };
const NOT_FOUND = { error: 'Clothing item not found' };

// GET /clothing?category=&clean=
export async function listClothingItems(req: AuthedRequest, res: Response) {
  const filter = validateClothingItemFilter(req.query);
  if (!filter.ok) {
    return res.status(400).json({ error: filter.error });
  }
  const items = await ClothingItem.find({ owner: getUserId(req), ...filter.value }).sort({ createdAt: -1, _id: -1 });
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
  const item = await ClothingItem.findOneAndUpdate(
    { _id: id, owner: getUserId(req) },
    { $set: update.value },
    { returnDocument: 'after', runValidators: true }
  );
  if (!item) {
    return res.status(404).json(NOT_FOUND);
  }
  res.json(toClothingItemResponse(item));
}

// DELETE /clothing/:id — also removes the item from the user's outfits.
export async function deleteClothingItem(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const userId = getUserId(req);
  const item = await ClothingItem.findOneAndDelete({ _id: id, owner: userId });
  if (!item) {
    return res.status(404).json(NOT_FOUND);
  }
  await Outfit.updateMany({ owner: userId, items: item._id }, { $pull: { items: item._id } });
  res.status(204).end();
}
