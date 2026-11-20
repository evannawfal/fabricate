import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { FriendRequest, type FriendRequestResponse } from '../models/friendRequest.js';
import { User, toFriendResponse } from '../models/user.js';
import { checkBodyFields, isObjectId, parseText } from '../validation/common.js';

const EMAIL_LENGTH = 254;
const MONGO_DUPLICATE_KEY = 11000;

type UserDocument = InstanceType<typeof User>;

function toRequestResponse(request: { id: string; createdAt: Date }, otherUser: UserDocument): FriendRequestResponse {
  return { id: request.id, user: toFriendResponse(otherUser), sentAt: request.createdAt };
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === MONGO_DUPLICATE_KEY;
}

async function areFriends(userId: string, otherId: string): Promise<boolean> {
  const pair = [userId, otherId];
  return (await User.countDocuments({ _id: { $in: pair }, friends: { $in: pair } })) === 2;
}

// Friendship is mutual. Our MongoDB has no transactions, so the two lists are updated separately;
// accepting again completes a friendship that only reached one of them.
async function makeFriends(userId: string, otherId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $addToSet: { friends: otherId } });
  await User.updateOne({ _id: otherId }, { $addToSet: { friends: userId } });
}

// GET /friends/requests
// Requests from or to an account that no longer exists are left out.
export async function listFriendRequests(req: AuthedRequest, res: Response) {
  const userId = getUserId(req);
  const newestFirst = { createdAt: -1, _id: -1 } as const;
  const [incoming, outgoing] = await Promise.all([
    FriendRequest.find({ to: userId }).sort(newestFirst).populate<{ from: UserDocument | null }>('from'),
    FriendRequest.find({ from: userId }).sort(newestFirst).populate<{ to: UserDocument | null }>('to'),
  ]);
  res.json({
    incoming: incoming.flatMap((request) => (request.from ? [toRequestResponse(request, request.from)] : [])),
    outgoing: outgoing.flatMap((request) => (request.to ? [toRequestResponse(request, request.to)] : [])),
  });
}

// POST /friends/requests
// If the other user already sent the user a request, this accepts it instead of sending one back.
export async function sendFriendRequest(req: AuthedRequest, res: Response) {
  const fields = checkBodyFields(req.body, ['email']);
  const email = fields.ok ? parseText(fields.value.email, 'email', EMAIL_LENGTH) : fields;
  if (!email.ok) return res.status(400).json({ error: email.error });
  const userId = getUserId(req);
  // Case-insensitive, since people often type emails with different capitalization.
  const other = await User.findOne({ email: email.value }).collation({ locale: 'en', strength: 2 });
  if (!other) return res.status(404).json({ error: 'No user has that email' });
  if (other.id === userId) return res.status(400).json({ error: "You can't send yourself a friend request" });
  if (await areFriends(userId, other.id)) return res.status(409).json({ error: 'You are already friends' });

  const theirRequest = await FriendRequest.findOne({ from: other._id, to: userId });
  if (theirRequest) {
    await makeFriends(userId, other.id);
    await FriendRequest.deleteOne({ _id: theirRequest._id });
    return res.status(200).json({ status: 'friends', friend: toFriendResponse(other) });
  }
  try {
    const request = await FriendRequest.create({ from: userId, to: other._id });
    res.status(201).json({ status: 'sent', request: toRequestResponse(request, other) });
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ error: 'You already sent them a friend request' });
    throw err;
  }
}

// POST /friends/requests/:id/accept
// Only the user the request was sent to can accept it.
export async function acceptFriendRequest(req: AuthedRequest, res: Response) {
  const requestId = req.params.id;
  if (!isObjectId(requestId)) return res.status(400).json({ error: 'Invalid friend request id' });
  const userId = getUserId(req);
  const request = await FriendRequest.findById(requestId);
  const sentBy = request?.from.toString();
  const sentTo = request?.to.toString();
  if (!request || (sentTo !== userId && sentBy !== userId)) {
    return res.status(404).json({ error: 'Friend request not found' });
  }
  if (sentTo !== userId) return res.status(403).json({ error: 'Only the person you sent it to can accept it' });
  const sender = await User.findById(request.from);
  if (!sender) {
    await FriendRequest.deleteOne({ _id: request._id });
    return res.status(404).json({ error: 'That account no longer exists' });
  }
  await makeFriends(userId, sender.id);
  await FriendRequest.deleteOne({ _id: request._id });
  res.json(toFriendResponse(sender));
}

// DELETE /friends/requests/:id
// The recipient declines the request, or the sender cancels it.
export async function deleteFriendRequest(req: AuthedRequest, res: Response) {
  const requestId = req.params.id;
  if (!isObjectId(requestId)) return res.status(400).json({ error: 'Invalid friend request id' });
  const userId = getUserId(req);
  const { deletedCount } = await FriendRequest.deleteOne({ _id: requestId, $or: [{ from: userId }, { to: userId }] });
  if (deletedCount === 0) return res.status(404).json({ error: 'Friend request not found' });
  res.status(204).end();
}
