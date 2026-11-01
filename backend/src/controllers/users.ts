import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { User, displayName, type UserDocument } from '../models/user.js';
import { checkBodyFields, parseText } from '../validation/common.js';

const PRONOUNS_LENGTH = 30;
const NOT_FOUND = { error: 'User not found' };

function toProfileResponse(user: UserDocument & { _id: unknown }) {
  return { id: String(user._id), name: displayName(user), email: user.email ?? '', pronouns: user.pronouns };
}

// GET /users/me
export async function getProfile(req: AuthedRequest, res: Response) {
  const user = await User.findById(getUserId(req));
  if (!user) return res.status(404).json(NOT_FOUND);
  res.json(toProfileResponse(user));
}

// PATCH /users/me
export async function updateProfile(req: AuthedRequest, res: Response) {
  const fields = checkBodyFields(req.body, ['pronouns']);
  const pronouns = fields.ok
    ? parseText(fields.value.pronouns, 'pronouns', PRONOUNS_LENGTH, { allowEmpty: true })
    : fields;
  if (!pronouns.ok) return res.status(400).json({ error: pronouns.error });
  const user = await User.findByIdAndUpdate(
    getUserId(req),
    { $set: { pronouns: pronouns.value } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!user) return res.status(404).json(NOT_FOUND);
  res.json(toProfileResponse(user));
}
