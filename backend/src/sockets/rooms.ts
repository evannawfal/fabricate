import type http from 'node:http';
import { Server, type Socket } from 'socket.io';
import { findRoomForMember } from '../controllers/rooms.js';
import { verifyToken } from '../middleware/middleware.js';
import { ClothingItem } from '../models/clothingItem.js';
import { OUTFIT_LIMITS } from '../models/outfit.js';
import { Message, ROOM_LIMITS, Room, toMessageResponse } from '../models/room.js';
import { User, displayName } from '../models/user.js';
import { toClothingItemResponsesWithImages } from '../services/clothingImages.js';
import { parseIdList, parseText, valid, type ValidationResult } from '../validation/common.js';

// A socket is opened per room: the app connects with { auth: { token, roomId } } when the
// room screen opens and disconnects when it closes.
interface RoomSocketData {
  userId: string;
  userName: string;
  roomId: string;
  memberIds: string[];
}

type Ack = (response: { ok: true } | { error: string }) => void;

function parseItemIds(value: unknown): ValidationResult<string[]> {
  // An empty board is allowed, unlike outfits.
  return Array.isArray(value) && value.length === 0 ? valid([]) : parseIdList(value, 'itemIds', OUTFIT_LIMITS.maxItems);
}

// Runs an event handler, answering the client's ack with { ok } or { error }.
function handle(roomId: string, handler: (payload: Record<string, unknown>) => Promise<string | undefined>) {
  return (payload: unknown, ack?: unknown) => {
    const reply: Ack = typeof ack === 'function' ? (ack as Ack) : () => undefined;
    const body = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    handler(body).then(
      (error) => reply(error === undefined ? { ok: true } : { error }),
      (err: unknown) => {
        console.error(`Room socket error in ${roomId}:`, err);
        reply({ error: 'Internal server error' });
      }
    );
  };
}

export function attachRoomSockets(server: http.Server): Server {
  const io = new Server(server);

  io.use((socket, next) => {
    const { token, roomId } = socket.handshake.auth as Record<string, unknown>;
    const userId = verifyToken(token);
    if (userId === undefined) return next(new Error('Invalid or expired token'));
    Promise.all([findRoomForMember(roomId, userId), User.findById(userId)]).then(
      ([access, user]) => {
        if (!('room' in access)) return next(new Error(access.error));
        const data: RoomSocketData = {
          userId,
          userName: user ? displayName(user) : 'Unknown user',
          roomId: access.room.id as string,
          memberIds: access.room.members.map((id) => id.toString()),
        };
        socket.data = data;
        next();
      },
      (err: unknown) => {
        console.error('Room socket connection failed:', err);
        next(new Error('Internal server error'));
      }
    );
  });

  io.on('connection', (socket: Socket) => {
    const { userId, userName, roomId, memberIds } = socket.data as RoomSocketData;
    void socket.join(roomId);

    // Broadcast first, then save, so storage time doesn't delay delivery (room latency NFR).
    socket.on(
      'room:message',
      handle(roomId, async ({ text }) => {
        const parsed = parseText(text, 'text', ROOM_LIMITS.messageLength);
        if (!parsed.ok) return parsed.error;
        const message = new Message({ room: roomId, sender: userId, senderName: userName, text: parsed.value });
        message.createdAt = new Date();
        io.to(roomId).emit('room:message', toMessageResponse(message));
        await message.save();
      })
    );

    socket.on(
      'room:outfitUpdate',
      handle(roomId, async ({ itemIds }) => {
        const parsed = parseItemIds(itemIds);
        if (!parsed.ok) return parsed.error;
        const ids = parsed.value;
        const items = await ClothingItem.find({ _id: { $in: ids }, owner: { $in: memberIds }, isArchived: false });
        if (items.length !== ids.length) return "All items must be in a room member's closet";
        const itemsById = new Map(items.map((item) => [item.id as string, item]));
        const ordered = ids.flatMap((id) => itemsById.get(id) ?? []);
        io.to(roomId).emit('room:outfitUpdate', {
          roomId,
          updatedBy: userId,
          items: await toClothingItemResponsesWithImages(ordered),
        });
        await Room.updateOne({ _id: roomId }, { $set: { outfitItems: ids } });
      })
    );

    socket.on('disconnect', () => {
      socket.to(roomId).emit('room:memberLeft', { roomId, userId, name: userName });
    });
  });

  return io;
}
