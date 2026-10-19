import { toClothingItemResponse, type ClothingItemDocument, type ClothingItemResponse } from '../models/clothingItem.js';
import { getFileStorage, isFileStorageConfigured } from './storage.js';

// A fresh download link for an item's photo. Returns null (instead of failing the request)
// when storage isn't available, so the closet still loads without images.
async function imageUrlFor(item: ClothingItemDocument): Promise<string | null> {
  if (!isFileStorageConfigured()) {
    return null;
  }
  try {
    return await getFileStorage().getDownloadUrl(item.imageKey);
  } catch (err) {
    console.error(`Could not create an image link for clothing item ${item._id.toString()}:`, err);
    return null;
  }
}

export async function toClothingItemResponseWithImage(item: ClothingItemDocument): Promise<ClothingItemResponse> {
  return toClothingItemResponse(item, await imageUrlFor(item));
}

export async function toClothingItemResponsesWithImages(items: ClothingItemDocument[]): Promise<ClothingItemResponse[]> {
  return Promise.all(items.map(toClothingItemResponseWithImage));
}
