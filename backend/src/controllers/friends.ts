import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { User, toFriendResponse } from '../models/user.js';
import { isObjectId } from '../validation/common.js';

// GET /friends
export async function listFriends(req: AuthedRequest, res: Response) {
  const user = await User.findById(getUserId(req)).populate<{ friends: InstanceType<typeof User>[] }>('friends');
  const friends = (user?.friends ?? []).map(toFriendResponse);
  res.json({ friends: friends.sort((a, b) => a.name.localeCompare(b.name)) });
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
