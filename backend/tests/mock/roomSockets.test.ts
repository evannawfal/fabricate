import { jest } from '@jest/globals';

import { ClothingItem } from '../../src/models/clothingItem.js';
import { Message, Room } from '../../src/models/room.js';
import { createClothingItem, createRoom, createUser } from '../helpers/fixtures.js';
import { tokenFor, useRoomSocketServer } from '../helpers/roomSockets.js';

const { join } = useRoomSocketServer();

// Silences the logged errors; the spy lets tests check they were logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

async function memberClient() {
  const user = await createUser();
  const room = await createRoom('Room', [user.id]);
  const client = await join({ token: tokenFor(user.id), roomId: room.id });
  return { user, room, client };
}

function forceError(model: typeof Room | typeof ClothingItem, method: 'findById' | 'find') {
  jest.spyOn(model as typeof Room, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

// Interface Socket.IO connection (auth: { token, roomId })
describe('Mocked: room socket connection', () => {
  // Mocked behavior: Room.findById throws while checking membership
  // Input: a member's token and room id
  // Expected behavior: the connection is refused and the error is logged
  // Expected output: connect_error "Internal server error"
  test('Room DB error while connecting', async () => {
    const user = await createUser();
    const room = await createRoom('Room', [user.id]);
    forceError(Room, 'findById');

    await expect(join({ token: tokenFor(user.id), roomId: room.id })).rejects.toThrow('Internal server error');
    expect(console.error).toHaveBeenCalledWith('Room socket connection failed:', expect.any(Error));
  });
});

// Interface Socket.IO event room:message
describe('Mocked: room:message', () => {
  // Mocked behavior: Message.prototype.save rejects after the message is broadcast
  // Input: { text }
  // Expected behavior: the error is logged
  // Expected output: ack { error: "Internal server error" }
  test('Message DB error while saving', async () => {
    const { client } = await memberClient();
    jest.spyOn(Message.prototype, 'save').mockRejectedValue(new Error('Forced database error'));

    expect(await client.emitWithAck('room:message', { text: 'hi' })).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^Room socket error/), expect.any(Error));
  });
});

// Interface Socket.IO event room:outfitUpdate
describe('Mocked: room:outfitUpdate', () => {
  // Mocked behavior: ClothingItem.find throws while checking the items
  // Input: { itemIds } with one of the member's items
  // Expected behavior: nothing is broadcast or saved; the error is logged
  // Expected output: ack { error: "Internal server error" }
  test('Clothing DB error while checking the items', async () => {
    const { user, room, client } = await memberClient();
    const shirt = await createClothingItem(user.id);
    forceError(ClothingItem, 'find');

    expect(await client.emitWithAck('room:outfitUpdate', { itemIds: [shirt.id] })).toEqual({
      error: 'Internal server error',
    });
    jest.restoreAllMocks();
    expect((await Room.findById(room.id))?.outfitItems).toHaveLength(0);
  });
});
