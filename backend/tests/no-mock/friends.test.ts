import request from 'supertest';

import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createUser, makeFriends, UNKNOWN_ID } from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

async function friendIdsOf(userId: string) {
  return (await User.findById(userId))?.friends.map(String);
}

// Interface GET /friends
describe('Unmocked: GET /friends', () => {
  // Input: a user with two friends
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { friends: [{ id, name, email }] } sorted by name
  test("Lists the user's friends", async () => {
    const user = await createUser();
    const zoe = await User.create({ googleId: 'g-zoe', email: 'zoe@example.com', givenName: 'Zoe' });
    const amy = await User.create({ googleId: 'g-amy', email: 'amy@example.com', givenName: 'Amy' });
    await makeFriends(user.id, zoe.id, amy.id);

    const response = await request(app).get('/friends').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.friends).toEqual([
      { id: amy.id, name: 'Amy', email: 'amy@example.com' },
      { id: zoe.id, name: 'Zoe', email: 'zoe@example.com' },
    ]);
  });

  // Input: a user with no friends
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { friends: [] }
  test('Empty friend list', async () => {
    const user = await createUser();

    const response = await request(app).get('/friends').set('Authorization', authHeader(user.id));

    expect(response.body).toEqual({ friends: [] });
  });

  // Input: friends with no name, and with neither a name nor an email
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the email stands in for a missing name, and "Unknown user" for both
  test('Names friends who have no name', async () => {
    const user = await createUser();
    const emailOnly = await User.create({ googleId: 'g-email', email: 'kai@example.com' });
    const nameless = await User.create({ googleId: 'g-none' });
    await makeFriends(user.id, emailOnly.id, nameless.id);

    const response = await request(app).get('/friends').set('Authorization', authHeader(user.id));

    expect(response.body.friends).toEqual([
      { id: emailOnly.id, name: 'kai@example.com', email: 'kai@example.com' },
      { id: nameless.id, name: 'Unknown user', email: '' },
    ]);
  });

  // Input: a valid session for an account that no longer exists
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { friends: [] }
  test('Deleted account has no friends', async () => {
    const response = await request(app).get('/friends').set('Authorization', authHeader(UNKNOWN_ID));

    expect(response.body).toEqual({ friends: [] });
  });
});

// Interface DELETE /friends/:id
describe('Unmocked: DELETE /friends/:id', () => {
  // Input: the id of one of the user's friends
  // Expected status code: 204
  // Expected behavior: both users are removed from each other's friend lists
  // Expected output: empty body
  test('Removes a friend', async () => {
    const user = await createUser();
    const friend = await createUser();
    await makeFriends(user.id, friend.id);

    const response = await request(app).delete(`/friends/${friend.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(await friendIdsOf(user.id)).toEqual([]);
    expect(await friendIdsOf(friend.id)).toEqual([]);
  });

  // Input: the id of a user who isn't a friend, and a malformed id
  // Expected status code: 404 and 400
  // Expected behavior: no friend list changes
  // Expected output: an error
  test.each([
    ['not a friend', 404],
    ['malformed', 400],
  ] as const)('Rejects an id that is %s', async (kind, status) => {
    const user = await createUser();
    const stranger = await createUser();
    const id = kind === 'malformed' ? 'nope' : stranger.id;

    const response = await request(app).delete(`/friends/${id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(status);
    expect(response.body.error).toEqual(expect.any(String));
  });
});

// Interfaces GET /friends and DELETE /friends/:id
describe('Unmocked: friend endpoints without sign-in', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: the request is rejected before the handler runs
  // Expected output: { error: "Missing token" }
  test.each([
    ['get', '/friends'],
    ['delete', `/friends/${UNKNOWN_ID}`],
  ] as const)('%s %s requires sign-in', async (method, path) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(401);
  });

  // Input: POST /friends, which used to add a friend without their consent
  // Expected status code: 404
  // Expected behavior: friends can only be added by accepting a friend request
  // Expected output: an error
  test('Friends can no longer be added directly', async () => {
    const user = await createUser();
    const other = await createUser();

    const response = await request(app).post('/friends').set('Authorization', authHeader(user.id)).send({ email: other.email });

    expect(response.status).toBe(404);
    expect(await friendIdsOf(user.id)).toEqual([]);
  });
});

// A friendship that only reached one of the two lists, e.g. after a database error part way through.
describe('Unmocked: half-saved friendships', () => {
  // Input: DELETE /friends/:id for a user whose list has the user, but not the other way round
  // Expected status code: 204
  // Expected behavior: the remaining side is removed
  // Expected output: empty body
  test('Removing clears the remaining side', async () => {
    const user = await createUser();
    const friend = await createUser();
    await User.updateOne({ _id: friend._id }, { $addToSet: { friends: user._id } });

    const response = await request(app).delete(`/friends/${friend.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(await friendIdsOf(friend.id)).toEqual([]);
  });
});
