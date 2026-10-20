import type { Response } from 'express';
import { exportAvatar } from '../avatar/exportAvatar.js';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { User } from '../models/user.js';
import { getAvatarModelUrl, saveAvatarModel } from '../services/avatarStorage.js';
import { getFileStorage } from '../services/storage.js';
import { CONTENT_TYPES } from '../services/storageKeys.js';
import { validateAvatarInput } from '../validation/avatar.js';

// POST /avatar (JSON body: height, shoulderWidth, chestWidth, waistWidth, hipWidth in metres)
// Generates the user's avatar model, stores it, saves it to their profile and returns a download link.
export async function createAvatar(req: AuthedRequest, res: Response) {
  const input = validateAvatarInput(req.body);
  if (!input.ok) {
    return res.status(400).json({ error: input.error });
  }
  // Checked before generating, so a missing configuration fails fast (503) instead of after the slow part.
  const storage = getFileStorage();
  const user = await User.findById(getUserId(req));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const glb = await exportAvatar(input.value);
  const key = await saveAvatarModel(user.id, glb, storage);
  const previousKey = user.avatarModelKey;
  user.avatarModelKey = key;
  try {
    await user.save();
  } catch (err) {
    // Don't leave an orphaned model in storage if the profile couldn't be updated.
    await storage.deleteFile(key).catch((cleanupErr: unknown) => {
      console.error(`Could not delete orphaned avatar model ${key}:`, cleanupErr);
    });
    throw err;
  }
  if (previousKey) {
    // Only the latest model is used, so the old one is removed (best effort).
    await storage.deleteFile(previousKey).catch((cleanupErr: unknown) => {
      console.error(`Could not delete old avatar model ${previousKey}:`, cleanupErr);
    });
  }

  res.status(201).json({ downloadUrl: await getAvatarModelUrl(key, storage), contentType: CONTENT_TYPES.glb });
}
