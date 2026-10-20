import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { validateAvatarInput } from '../validation/avatar.js';
import { exportAvatar } from '../avatar/exportAvatar.js';
import {
  saveAvatarModel,
  getAvatarModelUrl,
} from '../services/avatarStorage.js';
import { User } from '../models/user.js';

export async function createAvatar(req: AuthedRequest, res: Response) {
  const input = validateAvatarInput(req.body);
  if (!input.ok) {
    return res.status(400).json({ error: input.error });
  }

  try {
    const userId = getUserId(req);

    const glb = await exportAvatar(input.value);
    const key = await saveAvatarModel(userId, glb);
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { avatarModelKey: key } },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const downloadUrl = await getAvatarModelUrl(key);

    return res.status(201).json({
      downloadUrl,
      contentType: 'model/gltf-binary',
    });
  } catch (error) {
    console.error('Failed to generate avatar:', error);

    return res.status(500).json({
      error: 'Failed to generate avatar',
    });
  }
}