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
  // Our MongoDB has no transactions, so the two lists are updated separately. Checking both
  // lists means a retry completes an add that only reached one of them.
  const pair = [userId, friend.id as string];
  if ((await User.countDocuments({ _id: { $in: pair }, friends: { $in: pair } })) === 2) {
    return res.status(409).json({ error: 'You are already friends' });
  }
  await User.updateOne({ _id: userId }, { $addToSet: { friends: friend._id } });
  await User.updateOne({ _id: friend._id }, { $addToSet: { friends: userId } });
  res.status(201).json(toFriendResponse(friend));
}

// DELETE /friends/:id
// Clears both lists in one command, and also clears a friendship that only one list still has.
export async function removeFriend(req: AuthedRequest, res: Response) {
  const friendId = req.params.id;
  if (!isObjectId(friendId)) return res.status(400).json({ error: 'Invalid friend id' });
  const pair = [getUserId(req), friendId];
  const { modifiedCount } = await User.updateMany(
    { _id: { $in: pair }, friends: { $in: pair } },
    { $pull: { friends: { $in: pair } } }
  );
  if (modifiedCount === 0) return res.status(404).json({ error: 'Not in your friend list' });
  res.status(204).end();
}
