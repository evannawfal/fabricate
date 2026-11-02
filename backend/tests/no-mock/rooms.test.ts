import request from 'supertest';

import { createApp } from '../../src/app.js';
import { Outfit } from '../../src/models/outfit.js';
import { Message, Room } from '../../src/models/room.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createRoom, createUser, makeFriends, UNKNOWN_ID } from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

async function friends() {
  const user = await createUser();
  const friend = await createUser();
  await makeFriends(user.id, friend.id);
  return { user, friend };
}

// Interface POST /rooms
describe('Unmocked: POST /rooms', () => {
  // Input: a room name and one of the user's friends
  // Expected status code: 201
  // Expected behavior: the room is saved with the user and the friend as members
  // Expected output: the room with both members' ids and names
  test('Creates a room with a friend', async () => {
    const { user, friend } = await friends();

    const response = await request(app)
      .post('/rooms')
      .set('Authorization', authHeader(user.id))
      .send({ name: ' Party fits ', friendIds: [friend.id] });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Party fits');
    expect(response.body.members).toEqual([
      { id: user.id, name: `Test ${user.familyName}` },
      { id: friend.id, name: `Test ${friend.familyName}` },
    ]);
    expect(await Room.countDocuments()).toBe(1);
  });

  // Input: a user id that isn't the user's friend
  // Expected status code: 400
  // Expected behavior: no room is saved
  // Expected output: an error saying rooms can only include friends
  test('Rejects users who are not friends', async () => {
    const { user } = await friends();
    const stranger = await createUser();

    const response = await request(app)
      .post('/rooms')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Room', friendIds: [stranger.id] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/only include your friends/);
    expect(await Room.countDocuments()).toBe(0);
  });

  // Input: invalid bodies
  // Expected status code: 400
  // Expected behavior: no room is saved
  // Expected output: an error describing the problem
  test.each([
    [{ friendIds: [UNKNOWN_ID] }, /name must be a string/],
    [{ name: ' ', friendIds: [UNKNOWN_ID] }, /name must not be empty/],
    [{ name: 'Room' }, /friendIds must be a non-empty array/],
    [{ name: 'Room', friendIds: ['nope'] }, /friendIds must only contain valid ids/],
    [{ name: 'Room', friendIds: [UNKNOWN_ID], members: [] }, /Unknown field: members/],
  ])('Invalid body %j', async (body, expectedError) => {
    const { user } = await friends();

    const response = await request(app).post('/rooms').set('Authorization', authHeader(user.id)).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    expect(await Room.countDocuments()).toBe(0);
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: the request is rejected before the handler runs
  // Expected output: { error: "Missing token" }
  test('Requires sign-in', async () => {
    const response = await request(app).post('/rooms').send({ name: 'Room', friendIds: [UNKNOWN_ID] });
    expect(response.status).toBe(401);
  });
});

// Interface GET /rooms
describe('Unmocked: GET /rooms', () => {
  // Input: a user who belongs to two rooms, plus a room they aren't in
  // Expected status code: 200
  // Expected behavior: only the user's rooms are returned, most recently updated first
  // Expected output: { rooms: [...] }
  test("Lists only the user's rooms", async () => {
    const { user, friend } = await friends();
    const other = await createUser();
    await createRoom('Older', [user.id, friend.id]);
    await createRoom('Newer', [friend.id, user.id]);
    await createRoom('Not mine', [friend.id, other.id]);

    const response = await request(app).get('/rooms').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.rooms.map((room: { name: string }) => room.name)).toEqual(['Newer', 'Older']);
  });
});

// Interface GET /rooms/:id
describe('Unmocked: GET /rooms/:id', () => {
  // Input: a room with a shared outfit and messages
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the room with its outfit items in board order and messages oldest first
  test('Returns the room with its outfit and messages', async () => {
    const { user, friend } = await friends();
    const shirt = await createClothingItem(user.id, { name: 'Shirt' });
    const jeans = await createClothingItem(friend.id, { name: 'Jeans', category: 'bottom' });
    const room = await createRoom('Room', [user.id, friend.id], [jeans.id, shirt.id]);
    await Message.create({ room: room._id, sender: user._id, senderName: 'A', text: 'first' });
    await Message.create({ room: room._id, sender: friend._id, senderName: 'B', text: 'second' });

    const response = await request(app).get(`/rooms/${room.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.outfitItems.map((item: { name: string }) => item.name)).toEqual(['Jeans', 'Shirt']);
    expect(response.body.messages.map((message: { text: string }) => message.text)).toEqual(['first', 'second']);
    expect(response.body.messages[0]).toMatchObject({ roomId: room.id, senderId: user.id, senderName: 'A' });
  });

  // Input: a room the user isn't a member of, an unknown id, and a malformed id
  // Expected status code: 403, 404 and 400
  // Expected behavior: nothing about the room is returned
  // Expected output: an error
  test.each([
    ['not a member', 403],
    ['unknown', 404],
    ['malformed', 400],
  ] as const)('Rejects a room that is %s', async (kind, status) => {
    const { user, friend } = await friends();
    const outsider = await createUser();
    const room = await createRoom('Room', [user.id, friend.id]);
    const id = { 'not a member': room.id, unknown: UNKNOWN_ID, malformed: 'abc' }[kind];

    const response = await request(app).get(`/rooms/${id}`).set('Authorization', authHeader(outsider.id));

    expect(response.status).toBe(status);
    expect(response.body.error).toEqual(expect.any(String));
  });
});

// Interface POST /rooms/:id/save
describe('Unmocked: POST /rooms/:id/save', () => {
  // Input: a room whose board has two of the user's items and one of the friend's
  // Expected status code: 201
  // Expected behavior: an outfit named after the room is saved with the user's items, in board order
  // Expected output: the saved outfit
  test("Saves the user's items from the shared outfit", async () => {
    const { user, friend } = await friends();
    const shirt = await createClothingItem(user.id, { name: 'Shirt' });
    const shoes = await createClothingItem(user.id, { name: 'Shoes', category: 'shoes' });
    const jeans = await createClothingItem(friend.id, { name: 'Jeans', category: 'bottom' });
    const room = await createRoom('Brunch', [user.id, friend.id], [shoes.id, jeans.id, shirt.id]);

    const response = await request(app).post(`/rooms/${room.id}/save`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Brunch', source: 'manual' });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['Shoes', 'Shirt']);
    const saved = await Outfit.findById(response.body.id);
    expect(saved?.owner.toString()).toBe(user.id);
  });

  // Input: a room whose board only has the friend's items
  // Expected status code: 400
  // Expected behavior: no outfit is saved
  // Expected output: an error explaining the board has none of the user's items
  test("Rejects a board without the user's items", async () => {
    const { user, friend } = await friends();
    const jeans = await createClothingItem(friend.id, { category: 'bottom' });
    const room = await createRoom('Room', [user.id, friend.id], [jeans.id]);

    const response = await request(app).post(`/rooms/${room.id}/save`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Input: a user who isn't a member of the room
  // Expected status code: 403
  // Expected behavior: no outfit is saved
  // Expected output: an error saying the user isn't a member
  test('Rejects non-members', async () => {
    const { user, friend } = await friends();
    const outsider = await createUser();
    const shirt = await createClothingItem(outsider.id);
    const room = await createRoom('Room', [user.id, friend.id], [shirt.id]);

    const response = await request(app).post(`/rooms/${room.id}/save`).set('Authorization', authHeader(outsider.id));

    expect(response.status).toBe(403);
    expect(await Outfit.countDocuments()).toBe(0);
  });
});
