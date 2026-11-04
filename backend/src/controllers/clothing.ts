import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem } from '../models/clothingItem.js';
import { getClothingClassifier, InvalidImageError } from '../services/classifier.js';
import { toClothingItemResponsesWithImages, toClothingItemResponseWithImage } from '../services/clothingImages.js';
import { getFileStorage } from '../services/storage.js';
import { validateClothingItemFilter, validateClothingItemUpdate } from '../validation/clothing.js';
import { isObjectId } from '../validation/common.js';
import { generateGarmentModel, meshTypeFor, UnsupportedGarmentError } from '../services/garmentMesh.js';
import { CONTENT_TYPES, clothingImageKey, garmentModelKey, type ImageExtension } from '../services/storageKeys.js';

const INVALID_ID = { error: 'Invalid clothing item id' };
const NOT_FOUND = { error: 'Clothing item not found' };
const ARCHIVED = { error: 'Clothing item is archived and can no longer be edited' };

const IMAGE_EXTENSIONS: Record<string, ImageExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type UploadedFiles = { photo?: Express.Multer.File[]; backPhoto?: Express.Multer.File[] };

function extensionFor(file: Express.Multer.File, which: 'front' | 'back'): ImageExtension {
  const extension = IMAGE_EXTENSIONS[file.mimetype];
  if (!extension) {
    const subject = which === 'front' ? 'image' : 'back image';
    throw new InvalidImageError(`Unsupported ${subject} type; use one of: ${Object.keys(IMAGE_EXTENSIONS).join(', ')}`);
  }
  return extension;
}

// POST /clothing (multipart/form-data with a `photo` file (front) and a `backPhoto` file (back), both required)
// Classifies the photos, stores them, then adds the item to the user's closet.
// Nothing is kept unless everything succeeds: no item without both photos, no orphaned photo in storage.
export async function uploadClothingItem(req: AuthedRequest, res: Response) {
  const files = req.files as UploadedFiles | undefined;
  const front = files?.photo?.[0];
  const back = files?.backPhoto?.[0];
  if (!front) {
    return res.status(400).json({ error: 'Missing photo: send the image as the "photo" field of a multipart form' });
  }
  if (!back) {
    return res.status(400).json({ error: 'Missing back photo: send the image as the "backPhoto" field of a multipart form' });
  }
  const frontExtension = extensionFor(front, 'front');
  const backExtension = extensionFor(back, 'back');
  // Both services are checked before doing any work, so a missing configuration fails fast (503).
  const classifier = getClothingClassifier();
  const storage = getFileStorage();
  const userId = getUserId(req);

  // Classify first so photos that aren't clothing are never stored.
  const classification = await classifier.classify(front.buffer, front.mimetype, {
    image: back.buffer,
    mediaType: back.mimetype,
  });
  const imageKey = clothingImageKey(userId, frontExtension);
  const backImageKey = clothingImageKey(userId, backExtension);

  let item;
  try {
    // Both keys are listed before uploading, so a failure part-way still cleans up whatever was written.
    await storage.uploadFile(imageKey, front.buffer, front.mimetype);
    await storage.uploadFile(backImageKey, back.buffer, back.mimetype);
    item = await ClothingItem.create({ owner: userId, ...classification, imageKey, backImageKey });
  } catch (err) {
    await Promise.all(
      [imageKey, backImageKey].map((key) =>
        storage.deleteFile(key).catch((cleanupErr: unknown) => {
          console.error(`Could not delete orphaned photo ${key}:`, cleanupErr);
        })
      )
    );
    throw err;
  }
  res.status(201).json(await toClothingItemResponseWithImage(item));
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
// Both photos are kept for the same reason.
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

// POST /clothing/:id/generate — builds the item's 3D model from a base mesh tinted with the front photo's
// colour, stores it and saves its key on the item. Generating again replaces the previous model.
export async function generateClothingItemMesh(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  // Checked first, so a missing configuration fails fast (503) instead of after the slow part.
  const storage = getFileStorage();
  const userId = getUserId(req);
  const item = await ClothingItem.findOne({ _id: id, owner: userId, isArchived: false });
  if (!item) {
    return res.status(404).json(NOT_FOUND);
  }
  const meshType = meshTypeFor(item);
  if (meshType === undefined) {
    throw new UnsupportedGarmentError(`3D models aren't available for ${item.category} items yet`);
  }

  const glb = await generateGarmentModel(await storage.downloadFile(item.imageKey), meshType);
  const key = garmentModelKey(userId, id);
  await storage.uploadFile(key, glb, CONTENT_TYPES.glb);

  let previous;
  try {
    // Returns the item as it was before the update, which gives us the old model's key.
    previous = await ClothingItem.findOneAndUpdate(
      { _id: id, owner: userId, isArchived: false },
      { $set: { modelKey: key } }
    );
  } catch (err) {
    await deleteQuietly(storage, key, 'orphaned garment model');
    throw err;
  }
  if (!previous) {
    // Archived or deleted while the model was being generated.
    await deleteQuietly(storage, key, 'orphaned garment model');
    return res.status(404).json(NOT_FOUND);
  }
  if (previous.modelKey) {
    await deleteQuietly(storage, previous.modelKey, 'old garment model');
  }
  res.status(201).json({ downloadUrl: await storage.getDownloadUrl(key), contentType: CONTENT_TYPES.glb, meshType });
}

// GET /clothing/:id/model — short-lived download link for the item's 3D model.
// Archived items still work, since past outfits keep showing them.
export async function getClothingItemModel(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json(INVALID_ID);
  }
  const item = await ClothingItem.findOne({ _id: id, owner: getUserId(req) });
  if (!item) {
    return res.status(404).json(NOT_FOUND);
  }
  if (!item.modelKey) {
    return res.status(404).json({ error: 'No 3D model has been generated for this item yet' });
  }
  res.json({ downloadUrl: await getFileStorage().getDownloadUrl(item.modelKey), contentType: CONTENT_TYPES.glb });
}

function deleteQuietly(storage: ReturnType<typeof getFileStorage>, key: string, what: string): Promise<void> {
  return storage.deleteFile(key).catch((err: unknown) => {
    console.error(`Could not delete ${what} ${key}:`, err);
  });
}