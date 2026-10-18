import { getFileStorage, type FileStorage } from './storage.js';
import { avatarModelKey, CONTENT_TYPES } from './storageKeys.js';

// Saves a generated avatar model (.glb bytes, e.g. from GLTFExporter.parseAsync with binary: true)
// and returns its storage key. Store the key on the user; use getAvatarModelUrl to give the app a link.
export async function saveAvatarModel(
  userId: string,
  glb: Uint8Array | ArrayBuffer,
  storage: FileStorage = getFileStorage()
): Promise<string> {
  const key = avatarModelKey(userId);
  await storage.uploadFile(key, glb, CONTENT_TYPES.glb);
  return key;
}

// Short-lived download URL the Android avatar viewer can load the model from.
export async function getAvatarModelUrl(key: string, storage: FileStorage = getFileStorage()): Promise<string> {
  return storage.getDownloadUrl(key);
}
