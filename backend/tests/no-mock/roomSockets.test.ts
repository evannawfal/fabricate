import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';

import { createApp } from '../../src/app.js';
import { Message, Room } from '../../src/models/room.js';
import { attachRoomSockets } from '../../src/sockets/rooms.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createRoom, createUser, makeFriends, UNKNOWN_ID } from '../helpers/fixtures.js';

const server = http.createServer(createApp());
const io = attachRoomSockets(server);
let url = '';
const clients: Socket[] = [];

beforeAll(async () => {
  await startTestDatabase();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
}, DATABASE_SETUP_TIMEOUT_MS);
afterEach(async () => {
  clients.splice(0).forEach((client) => client.disconnect());
  await clearTestDatabase();
});
afterAll(async () => {
  await io.close();
  await stopTestDatabase();
});

function tokenFor(userId: string) {
  return authHeader(userId).slice('Bearer '.length);
}

// Connects a client and resolves once connected, or rejects with the server's error message.
function join(auth: Record<string, unknown>): Promise<Socket> {
  const client = connect(url, { auth, transports: ['websocket'], reconnection: false });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.on('connect', () => resolve(client));
    client.on('connect_error', (err) => reject(err));
  });
}

function nextEvent<T>(client: Socket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

async function roomWithTwoMembers() {
  const user = await createUser();
  const friend = await createUser();
  await makeFriends(user.id, friend.id);
  const room = await createRoom('Room', [user.id, friend.id]);
  const userClient = await join({ token: tokenFor(user.id), roomId: room.id });
  const friendClient = await join({ token: tokenFor(friend.id), roomId: room.id });
  return { user, friend, room, userClient, friendClient };
}

// Interface Socket.IO connection (auth: { token, roomId })
describe('Unmocked: room socket connection', () => {
  // Input: a missing token, an unknown room, and a room the user isn't a member of
  // Expected behavior: the connection is refused
  // Expected output: connect_error with the reason
  test.each([
    ['no token', /Invalid or expired token/],
    ['unknown room', /Room not found/],
    ['not a member', /not a member/],
  ] as const)('Refuses a connection with %s', async (kind, expectedError) => {
    const user = await createUser();
    const outsider = await createUser();
    const room = await createRoom('Room', [user.id]);
    const auth = {
      'no token': { roomId: room.id },
      'unknown room': { token: tokenFor(user.id), roomId: UNKNOWN_ID },
      'not a member': { token: tokenFor(outsider.id), roomId: room.id },
    }[kind];

    await expect(join(auth)).rejects.toThrow(expectedError);
  });
});

// Interface Socket.IO event room:message
describe('Unmocked: room:message', () => {
  // Input: { text } sent by one member
  // Expected behavior: every member receives the message, and it is saved
  // Expected output: ack { ok: true } and a Message on the other client
  test('Delivers a message to the other member and saves it', async () => {
    const { user, room, userClient, friendClient } = await roomWithTwoMembers();
    const received = nextEvent<{ text: string; senderId: string; roomId: string }>(friendClient, 'room:message');

    const ack = await userClient.emitWithAck('room:message', { roomId: room.id, text: ' hi! ' });

    expect(ack).toEqual({ ok: true });
    expect(await received).toMatchObject({ text: 'hi!', senderId: user.id, roomId: room.id });
    expect(await Message.countDocuments({ room: room._id, text: 'hi!' })).toBe(1);
  });

  // Input: an empty and a missing text
  // Expected behavior: nothing is sent or saved
  // Expected output: ack with an error
  test.each([{ text: '  ' }, {}])('Rejects invalid message %j', async (payload) => {
    const { userClient } = await roomWithTwoMembers();

    const ack = await userClient.emitWithAck('room:message', payload);

    expect(ack.error).toMatch(/text must/);
    expect(await Message.countDocuments()).toBe(0);
  });
});

// Interface Socket.IO event room:outfitUpdate
describe('Unmocked: room:outfitUpdate', () => {
  // Input: { itemIds } with one item from each member's closet
  // Expected behavior: every member receives the new board, and the room's outfit is saved
  // Expected output: ack { ok: true } and the items' details on the other client
  test("Shares items from both members' closets", async () => {
    const { user, friend, room, userClient, friendClient } = await roomWithTwoMembers();
    const shirt = await createClothingItem(user.id, { name: 'Shirt' });
    const jeans = await createClothingItem(friend.id, { name: 'Jeans', category: 'bottom' });
    const received = nextEvent<{ items: { name: string }[]; updatedBy: string }>(friendClient, 'room:outfitUpdate');

    const ack = await userClient.emitWithAck('room:outfitUpdate', { itemIds: [jeans.id, shirt.id] });

    expect(ack).toEqual({ ok: true });
    const update = await received;
    expect(update.updatedBy).toBe(user.id);
    expect(update.items.map((item) => item.name)).toEqual(['Jeans', 'Shirt']);
    const saved = await Room.findById(room.id);
    expect(saved?.outfitItems.map(String)).toEqual([jeans.id, shirt.id]);
  });

  // Input: an empty list
  // Expected behavior: the board is cleared for every member
  // Expected output: ack { ok: true }
  test('Clears the board', async () => {
    const { user, friend, userClient } = await roomWithTwoMembers();
    const shirt = await createClothingItem(user.id);
    const room = await createRoom('Board', [user.id, friend.id], [shirt.id]);
    const client = await join({ token: tokenFor(user.id), roomId: room.id });

    expect(await client.emitWithAck('room:outfitUpdate', { itemIds: [] })).toEqual({ ok: true });
    expect((await Room.findById(room.id))?.outfitItems).toHaveLength(0);
    expect(userClient.connected).toBe(true);
  });

  // Input: an item from a non-member's closet, an archived item, and malformed ids
  // Expected behavior: the board doesn't change
  // Expected output: ack with an error
  test.each(['outsider item', 'archived item', 'malformed'] as const)('Rejects %s', async (kind) => {
    const { user, room, userClient } = await roomWithTwoMembers();
    const outsider = await createUser();
    const ids = {
      'outsider item': [(await createClothingItem(outsider.id)).id],
      'archived item': [(await createClothingItem(user.id, { isArchived: true })).id],
      malformed: 'nope',
    }[kind];

    const ack = await userClient.emitWithAck('room:outfitUpdate', { itemIds: ids });

    expect(ack.error).toEqual(expect.any(String));
    expect((await Room.findById(room.id))?.outfitItems).toHaveLength(0);
  });
});

// Interface Socket.IO event room:memberLeft
describe('Unmocked: room:memberLeft', () => {
  // Input: one member disconnects
  // Expected behavior: the remaining member is told who left
  // Expected output: { roomId, userId, name } on the other client
  test('Notifies the other members when someone leaves', async () => {
    const { friend, room, userClient, friendClient } = await roomWithTwoMembers();
    const left = nextEvent<{ userId: string; roomId: string }>(userClient, 'room:memberLeft');

    friendClient.disconnect();

    expect(await left).toMatchObject({ userId: friend.id, roomId: room.id });
  });
});
