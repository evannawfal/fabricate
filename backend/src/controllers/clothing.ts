import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem } from '../models/clothingItem.js';
import { getClothingClassifier, InvalidImageError } from '../services/classifier.js';
import { toClothingItemResponsesWithImages, toClothingItemResponseWithImage } from '../services/clothingImages.js';
import { getFileStorage } from '../services/storage.js';
import { clothingImageKey, type ImageExtension } from '../services/storageKeys.js';
import { validateClothingItemFilter, validateClothingItemUpdate } from '../validation/clothing.js';
import { isObjectId } from '../validation/common.js';

const INVALID_ID = { error: 'Invalid clothing item id' };
const NOT_FOUND = { error: 'Clothing item not found' };
const ARCHIVED = { error: 'Clothing item is archived and can no longer be edited' };

const IMAGE_EXTENSIONS: Record<string, ImageExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// POST /clothing (multipart/form-data with a `photo` file)
// Classifies the photo, stores it, then adds the item to the user's closet.
export async function uploadClothingItem(req: AuthedRequest, res: Response) {
  const photo = req.file;
  if (!photo) {
    return res.status(400).json({ error: 'Missing photo: send the image as the "photo" field of a multipart form' });
  }
  const extension = IMAGE_EXTENSIONS[photo.mimetype];
  if (!extension) {
    throw new InvalidImageError(`Unsupported image type; use one of: ${Object.keys(IMAGE_EXTENSIONS).join(', ')}`);
  }
  // Both services are checked before doing any work, so a missing configuration fails fast (503).
  const classifier = getClothingClassifier();
  const storage = getFileStorage();
  const userId = getUserId(req);

  // Classify first so photos that aren't clothing are never stored.
  const classification = await classifier.classify(photo.buffer, photo.mimetype);
  const imageKey = clothingImageKey(userId, extension);
  await storage.uploadFile(imageKey, photo.buffer, photo.mimetype);

  try {
    const item = await ClothingItem.create({ owner: userId, ...classification, imageKey });
    res.status(201).json(await toClothingItemResponseWithImage(item));
  } catch (err) {
    // Don't leave an orphaned photo in storage if the item couldn't be saved.
    await storage.deleteFile(imageKey).catch((cleanupErr: unknown) => {
      console.error(`Could not delete orphaned photo ${imageKey}:`, cleanupErr);
    });
    throw err;
  }
}

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
  res.json({ items: await toClothingItemResponsesWithImages(items) });
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
  res.json(await toClothingItemResponseWithImage(item));
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
  res.json(await toClothingItemResponseWithImage(item));
}

// DELETE /clothing/:id — archives the item: it leaves the closet but past outfits keep showing it.
// The photo is kept for the same reason.
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
