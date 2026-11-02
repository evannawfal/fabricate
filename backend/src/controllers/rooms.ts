import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem } from '../models/clothingItem.js';
import { saveOutfit, toOutfitResponse } from '../models/outfit.js';
import { Message, ROOM_LIMITS, Room, toMessageResponse, type RoomDocument } from '../models/room.js';
import { User, displayName, getFriendIds } from '../models/user.js';
import { toClothingItemResponsesWithImages } from '../services/clothingImages.js';
import { isObjectId } from '../validation/common.js';
import { validateRoomInput } from '../validation/room.js';

export type RoomAccess = { room: RoomDocument } | { status: 400 | 403 | 404; error: string };

export async function findRoomForMember(roomId: unknown, userId: string): Promise<RoomAccess> {
  if (!isObjectId(roomId)) return { status: 400, error: 'Invalid room id' };
  const room = await Room.findById(roomId);
  if (!room) return { status: 404, error: 'Room not found' };
  if (!room.members.some((id) => id.toString() === userId)) {
    return { status: 403, error: 'You are not a member of this room' };
  }
  return { room };
}

async function toRoomResponses(rooms: RoomDocument[]) {
  const users = await User.find({ _id: { $in: rooms.flatMap((room) => room.members) } });
  const namesById = new Map(users.map((user) => [user.id as string, displayName(user)]));
  return rooms.map((room) => ({
    id: room.id as string,
    name: room.name,
    members: room.members.map((id) => ({ id: id.toString(), name: namesById.get(id.toString()) ?? 'Unknown user' })),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }));
}

// POST /rooms
export async function createRoom(req: AuthedRequest, res: Response) {
  const input = validateRoomInput(req.body);
  if (!input.ok) return res.status(400).json({ error: input.error });
  const userId = getUserId(req);
  const friendIds = new Set(await getFriendIds(userId));
  if (!input.value.friendIds.every((id) => friendIds.has(id))) {
    return res.status(400).json({ error: 'Rooms can only include your friends' });
  }
  const room = await Room.create({ name: input.value.name, members: [userId, ...input.value.friendIds] });
  const [response] = await toRoomResponses([room]);
  res.status(201).json(response);
}

// GET /rooms
export async function listRooms(req: AuthedRequest, res: Response) {
  const rooms = await Room.find({ members: getUserId(req) }).sort({ updatedAt: -1, _id: -1 });
  res.json({ rooms: await toRoomResponses(rooms) });
}

// GET /rooms/:id
export async function getRoom(req: AuthedRequest, res: Response) {
  const access = await findRoomForMember(req.params.id, getUserId(req));
  if (!('room' in access)) return res.status(access.status).json({ error: access.error });
  const { room } = access;
  const [[response], items, messages] = await Promise.all([
    toRoomResponses([room]),
    ClothingItem.find({ _id: { $in: room.outfitItems } }),
    Message.find({ room: room._id }).sort({ createdAt: -1, _id: -1 }).limit(ROOM_LIMITS.recentMessages),
  ]);
  const itemsById = new Map(items.map((item) => [item.id as string, item]));
  const boardItems = room.outfitItems.flatMap((id) => itemsById.get(id.toString()) ?? []);
  res.json({
    ...response,
    outfitItems: await toClothingItemResponsesWithImages(boardItems),
    messages: messages.reverse().map(toMessageResponse),
  });
}

// POST /rooms/:id/save
// Only the user's own items are saved, since outfits can only show items from the user's closet.
export async function saveRoomOutfit(req: AuthedRequest, res: Response) {
  const userId = getUserId(req);
  const access = await findRoomForMember(req.params.id, userId);
  if (!('room' in access)) return res.status(access.status).json({ error: access.error });
  const { room } = access;
  const owned = await ClothingItem.find({ _id: { $in: room.outfitItems }, owner: userId, isArchived: false });
  const ownedById = new Map(owned.map((item) => [item.id as string, item]));
  const items = room.outfitItems.flatMap((id) => ownedById.get(id.toString()) ?? []);
  if (items.length === 0) {
    return res.status(400).json({ error: 'The shared outfit has none of your clothing items' });
  }
  const outfit = await saveOutfit(userId, room.name, items.map((item) => item.id as string));
  res.status(201).json(toOutfitResponse(outfit, await toClothingItemResponsesWithImages(items)));
}
