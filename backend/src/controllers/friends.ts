import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { User, displayName } from '../models/user.js';
import { checkBodyFields, isObjectId, parseText } from '../validation/common.js';

const EMAIL_LENGTH = 254;

function toFriendResponse(user: { id: string; email?: string | null; givenName?: string | null; familyName?: string | null }) {
  return { id: user.id, name: displayName(user), email: user.email ?? '' };
}

// GET /friends
export async function listFriends(req: AuthedRequest, res: Response) {
  const user = await User.findById(getUserId(req)).populate<{ friends: InstanceType<typeof User>[] }>('friends');
  const friends = (user?.friends ?? []).map(toFriendResponse);
  res.json({ friends: friends.sort((a, b) => a.name.localeCompare(b.name)) });
}

// POST /friends
// Friendship is mutual, so either friend can invite the other to rooms.
export async function addFriend(req: AuthedRequest, res: Response) {
  const fields = checkBodyFields(req.body, ['email']);
  const email = fields.ok ? parseText(fields.value.email, 'email', EMAIL_LENGTH) : fields;
  if (!email.ok) return res.status(400).json({ error: email.error });
  const userId = getUserId(req);
  // Case-insensitive, since people often type emails with different capitalization.
  const friend = await User.findOne({ email: email.value }).collation({ locale: 'en', strength: 2 });
  if (!friend) return res.status(404).json({ error: 'No user has that email' });
  if (friend.id === userId) return res.status(400).json({ error: "You can't add yourself as a friend" });
  if (friend.friends.some((id) => id.toString() === userId)) {
    return res.status(409).json({ error: 'You are already friends' });
  }
  await Promise.all([
    User.updateOne({ _id: userId }, { $addToSet: { friends: friend._id } }),
    User.updateOne({ _id: friend._id }, { $addToSet: { friends: userId } }),
  ]);
  res.status(201).json(toFriendResponse(friend));
}

// DELETE /friends/:id
export async function removeFriend(req: AuthedRequest, res: Response) {
  const friendId = req.params.id;
  if (!isObjectId(friendId)) return res.status(400).json({ error: 'Invalid friend id' });
  const userId = getUserId(req);
  const { modifiedCount } = await User.updateOne({ _id: userId, friends: friendId }, { $pull: { friends: friendId } });
  if (modifiedCount === 0) return res.status(404).json({ error: 'Not in your friend list' });
  await User.updateOne({ _id: friendId }, { $pull: { friends: userId } });
  res.status(204).end();
}
