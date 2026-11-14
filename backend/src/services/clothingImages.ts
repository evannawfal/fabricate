import { toClothingItemResponse, type ClothingItemDocument, type ClothingItemResponse } from '../models/clothingItem.js';
import { getFileStorage, isFileStorageConfigured } from './storage.js';
import { referencePointsForItem } from './garmentMesh.js';

// A fresh download link for one of an item's photos. Returns null (instead of failing the request)
// when there is no such photo or storage isn't available, so the closet still loads without images.
async function downloadUrlFor(item: ClothingItemDocument, key: string | null | undefined): Promise<string | null> {
  if (key === null || key === undefined || key === '' || !isFileStorageConfigured()) {
    return null;
  }
  try {
    return await getFileStorage().getDownloadUrl(key);
  } catch (err) {
    console.error(`Could not create an image link for clothing item ${item._id.toString()}:`, err);
    return null;
  }
}

export async function toClothingItemResponseWithImage(item: ClothingItemDocument): Promise<ClothingItemResponse> {
  const [imageUrl, backImageUrl] = await Promise.all([
    downloadUrlFor(item, item.imageKey),
    downloadUrlFor(item, item.backImageKey),
  ]);
  const referencePoints = referencePointsForItem(item);
  return toClothingItemResponse(item, imageUrl, backImageUrl, referencePoints);
}

export async function toClothingItemResponsesWithImages(items: ClothingItemDocument[]): Promise<ClothingItemResponse[]> {
  return Promise.all(items.map(toClothingItemResponseWithImage));
}
