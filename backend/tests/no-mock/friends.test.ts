import request from 'supertest';

import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createUser, makeFriends } from '../helpers/fixtures.js';

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
});

// Interface POST /friends
describe('Unmocked: POST /friends', () => {
  // Input: another user's email in different capitalization
  // Expected status code: 201
  // Expected behavior: both users are added to each other's friend lists
  // Expected output: the new friend
  test('Adds a friend by email', async () => {
    const user = await createUser();
    const friend = await createUser();

    const response = await request(app)
      .post('/friends')
      .set('Authorization', authHeader(user.id))
      .send({ email: ` ${friend.email?.toUpperCase()} ` });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: friend.id, email: friend.email });
    expect(await friendIdsOf(user.id)).toEqual([friend.id]);
    expect(await friendIdsOf(friend.id)).toEqual([user.id]);
  });

  // Input: an unknown email, the user's own email, and a friend's email
  // Expected status code: 404, 400 and 409
  // Expected behavior: no friend is added
  // Expected output: an error explaining why
  test.each([
    ['unknown', 404, /No user has that email/],
    ['own', 400, /add yourself/],
    ['existing friend', 409, /already friends/],
  ] as const)('Rejects an %s email', async (kind, status, expectedError) => {
    const user = await createUser();
    const friend = await createUser();
    await makeFriends(user.id, friend.id);
    const email = { unknown: 'nobody@example.com', own: user.email, 'existing friend': friend.email }[kind];

    const response = await request(app).post('/friends').set('Authorization', authHeader(user.id)).send({ email });

    expect(response.status).toBe(status);
    expect(response.body.error).toMatch(expectedError);
    expect(await friendIdsOf(user.id)).toEqual([friend.id]);
  });

  // Input: invalid bodies
  // Expected status code: 400
  // Expected behavior: no friend is added
  // Expected output: an error describing the problem
  test.each([[{}], [{ email: '' }], [{ email: 5 }], [{ email: 'a@b.c', name: 'x' }], [[]]])(
    'Invalid body %j',
    async (body) => {
      const user = await createUser();

      const response = await request(app).post('/friends').set('Authorization', authHeader(user.id)).send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual(expect.any(String));
    }
  );
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
