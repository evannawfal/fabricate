import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { Room } from '../../src/models/room.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createRoom, createUser, makeFriends } from '../helpers/fixtures.js';

const app = createApp();

// Makes a DB call throw, like a lost database connection would.
function failCall<M extends typeof Room | typeof User>(model: M, method: 'create' | 'find' | 'findById') {
  return jest.spyOn(model as typeof Room, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

async function friends() {
  const user = await createUser();
  const friend = await createUser();
  await makeFriends(user.id, friend.id);
  return { user, friend };
}

function expectInternalError(response: request.Response) {
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: 'Internal server error' });
  expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
// Silences the error handler's log of each forced 500; the spy lets tests check it was logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /rooms
describe('Mocked: POST /rooms', () => {
  // Mocked behavior: User.findById throws while loading the user's friends
  // Input: a room name and a friend
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no room is saved
  // Expected output: { error: "Internal server error" }
  test('User DB error while loading friends', async () => {
    const { user, friend } = await friends();
    failCall(User, 'findById');

    const response = await request(app)
      .post('/rooms')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Room', friendIds: [friend.id] });

    expectInternalError(response);
    jest.restoreAllMocks();
    expect(await Room.countDocuments()).toBe(0);
  });

  // Mocked behavior: Room.create throws
  // Input: a room name and a friend
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test('Room DB error while saving', async () => {
    const { user, friend } = await friends();
    failCall(Room, 'create');

    const response = await request(app)
      .post('/rooms')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Room', friendIds: [friend.id] });

    expectInternalError(response);
  });
});

// Interface GET /rooms
describe('Mocked: GET /rooms', () => {
  // Mocked behavior: Room.find throws
  // Input: a signed-in user
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test('Room DB error while listing', async () => {
    const user = await createUser();
    failCall(Room, 'find');

    expectInternalError(await request(app).get('/rooms').set('Authorization', authHeader(user.id)));
  });
});

// Interface GET /rooms/:id and POST /rooms/:id/save
describe('Mocked: GET /rooms/:id and POST /rooms/:id/save', () => {
  // Mocked behavior: Room.findById throws while checking membership
  // Input: a member of the room
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test.each(['get', 'post'] as const)('Room DB error while checking membership (%s)', async (method) => {
    const { user, friend } = await friends();
    const room = await createRoom('Room', [user.id, friend.id]);
    failCall(Room, 'findById');

    const path = method === 'get' ? `/rooms/${room.id}` : `/rooms/${room.id}/save`;
    expectInternalError(await request(app)[method](path).set('Authorization', authHeader(user.id)));
  });
});
