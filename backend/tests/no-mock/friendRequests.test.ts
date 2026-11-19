import request from 'supertest';

import { createApp } from '../../src/app.js';
import { FriendRequest } from '../../src/models/friendRequest.js';
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

async function requestsBetween(fromId: string, toId: string) {
  return FriendRequest.countDocuments({ from: fromId, to: toId });
}

function sendRequest(userId: string, email: unknown) {
  return request(app).post('/friends/requests').set('Authorization', authHeader(userId)).send({ email });
}

function accept(userId: string, requestId: string) {
  return request(app).post(`/friends/requests/${requestId}/accept`).set('Authorization', authHeader(userId));
}

function remove(userId: string, requestId: string) {
  return request(app).delete(`/friends/requests/${requestId}`).set('Authorization', authHeader(userId));
}

// Interface GET /friends/requests
describe('Unmocked: GET /friends/requests', () => {
  // Input: two requests sent to the user, a minute apart, and one the user sent
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { incoming, outgoing }, each newest first, naming the other user
  test('Lists requests sent to and by the user', async () => {
    const user = await createUser();
    const [older, newer, invited] = [await createUser(), await createUser(), await createUser()];
    const first = await FriendRequest.create({ from: older.id, to: user.id, createdAt: new Date(Date.now() - 60_000) });
    const second = await FriendRequest.create({ from: newer.id, to: user.id });
    const sent = await FriendRequest.create({ from: user.id, to: invited.id });

    const response = await request(app).get('/friends/requests').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      incoming: [
        { id: second.id, user: { id: newer.id, name: expect.any(String), email: newer.email }, sentAt: expect.any(String) },
        { id: first.id, user: { id: older.id, name: expect.any(String), email: older.email }, sentAt: expect.any(String) },
      ],
      outgoing: [{ id: sent.id, user: { id: invited.id, name: expect.any(String), email: invited.email }, sentAt: expect.any(String) }],
    });
  });

  // Input: requests to and from users whose accounts were since deleted
  // Expected status code: 200
  // Expected behavior: there's no one to show for them
  // Expected output: { incoming: [], outgoing: [] }
  test('Leaves out requests involving deleted accounts', async () => {
    const user = await createUser();
    const gone = await createUser();
    await FriendRequest.create({ from: gone.id, to: user.id });
    await FriendRequest.create({ from: user.id, to: UNKNOWN_ID });
    await User.deleteOne({ _id: gone.id });

    const response = await request(app).get('/friends/requests').set('Authorization', authHeader(user.id));

    expect(response.body).toEqual({ incoming: [], outgoing: [] });
  });
});

// Interface POST /friends/requests
describe('Unmocked: POST /friends/requests', () => {
  // Input: another user's email, with different capitalization and surrounding spaces
  // Expected status code: 201
  // Expected behavior: a request is saved; neither friend list changes until it's accepted
  // Expected output: { status: "sent", request } naming the other user
  test('Sends a friend request by email', async () => {
    const user = await createUser();
    const other = await createUser();

    const response = await sendRequest(user.id, ` ${other.email?.toUpperCase()} `);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      status: 'sent',
      request: { id: expect.any(String), user: { id: other.id, name: expect.any(String), email: other.email }, sentAt: expect.any(String) },
    });
    expect(await requestsBetween(user.id, other.id)).toBe(1);
    expect(await friendIdsOf(user.id)).toEqual([]);
    expect(await friendIdsOf(other.id)).toEqual([]);
  });

  // Input: the email of a user who already sent the user a request
  // Expected status code: 200
  // Expected behavior: their request is accepted instead of a second one being sent
  // Expected output: { status: "friends", friend }
  test('Accepts their request if they asked first', async () => {
    const user = await createUser();
    const other = await createUser();
    await FriendRequest.create({ from: other.id, to: user.id });

    const response = await sendRequest(user.id, other.email);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'friends', friend: { id: other.id, name: expect.any(String), email: other.email } });
    expect(await friendIdsOf(user.id)).toEqual([other.id]);
    expect(await friendIdsOf(other.id)).toEqual([user.id]);
    expect(await FriendRequest.countDocuments()).toBe(0);
  });

  // Input: an unknown email, the user's own email, a friend's email, and the email of a user
  // who already has a request from the user
  // Expected status code: 404, 400, 409 and 409
  // Expected behavior: no request is saved
  // Expected output: an error explaining why
  test.each([
    ['unknown', 404, /No user has that email/],
    ['own', 400, /yourself/],
    ['friend', 409, /already friends/],
    ['already requested', 409, /already sent them/],
  ] as const)('Rejects an %s email', async (kind, status, expectedError) => {
    const user = await createUser();
    const friend = await createUser();
    const requested = await createUser();
    await makeFriends(user.id, friend.id);
    await FriendRequest.create({ from: user.id, to: requested.id });
    const email = { unknown: 'nobody@example.com', own: user.email, friend: friend.email, 'already requested': requested.email }[kind];

    const response = await sendRequest(user.id, email);

    expect(response.status).toBe(status);
    expect(response.body.error).toMatch(expectedError);
    expect(await FriendRequest.countDocuments()).toBe(1);
  });

  // Input: invalid bodies
  // Expected status code: 400
  // Expected behavior: no request is saved
  // Expected output: an error describing the problem
  test.each([[{}], [{ email: '' }], [{ email: 5 }], [{ email: 'a@b.c', name: 'x' }], [[]]])(
    'Invalid body %j',
    async (body) => {
      const user = await createUser();

      const response = await request(app).post('/friends/requests').set('Authorization', authHeader(user.id)).send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual(expect.any(String));
      expect(await FriendRequest.countDocuments()).toBe(0);
    }
  );
});

// Interface POST /friends/requests/:id/accept
describe('Unmocked: POST /friends/requests/:id/accept', () => {
  // Input: a request sent to the user
  // Expected status code: 200
  // Expected behavior: both users are added to each other's friend lists and the request is removed
  // Expected output: the new friend
  test('Accepts a request', async () => {
    const user = await createUser();
    const sender = await createUser();
    const sent = await FriendRequest.create({ from: sender.id, to: user.id });

    const response = await accept(user.id, sent.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: sender.id, name: expect.any(String), email: sender.email });
    expect(await friendIdsOf(user.id)).toEqual([sender.id]);
    expect(await friendIdsOf(sender.id)).toEqual([user.id]);
    expect(await FriendRequest.countDocuments()).toBe(0);
  });

  // Input: a request whose friendship already reached one list, e.g. after a database error part way through
  // Expected status code: 200
  // Expected behavior: accepting again completes the friendship
  // Expected output: the new friend
  test('Completes a half-saved friendship', async () => {
    const user = await createUser();
    const sender = await createUser();
    const sent = await FriendRequest.create({ from: sender.id, to: user.id });
    await User.updateOne({ _id: user.id }, { $addToSet: { friends: sender._id } });

    const response = await accept(user.id, sent.id);

    expect(response.status).toBe(200);
    expect(await friendIdsOf(user.id)).toEqual([sender.id]);
    expect(await friendIdsOf(sender.id)).toEqual([user.id]);
  });

  // Input: the sender's own request, a request between two other users, an unknown id, and a malformed id
  // Expected status code: 403, 404, 404 and 400
  // Expected behavior: no friendship is made and the request stays
  // Expected output: an error
  test.each([
    ['sent by the user', 403],
    ["someone else's", 404],
    ['unknown', 404],
    ['malformed', 400],
  ] as const)('Rejects a request that is %s', async (kind, status) => {
    const user = await createUser();
    const other = await createUser();
    const stranger = await createUser();
    const mine = await FriendRequest.create({ from: user.id, to: other.id });
    const theirs = await FriendRequest.create({ from: other.id, to: stranger.id });
    const id = { 'sent by the user': mine.id, "someone else's": theirs.id, unknown: UNKNOWN_ID, malformed: 'nope' }[kind];

    const response = await accept(user.id, id);

    expect(response.status).toBe(status);
    expect(response.body.error).toEqual(expect.any(String));
    expect(await friendIdsOf(user.id)).toEqual([]);
    expect(await FriendRequest.countDocuments()).toBe(2);
  });

  // Input: a request from a user whose account was since deleted
  // Expected status code: 404
  // Expected behavior: the request can't be accepted, so it's removed
  // Expected output: { error: "That account no longer exists" }
  test('Removes a request from a deleted account', async () => {
    const user = await createUser();
    const gone = await createUser();
    const sent = await FriendRequest.create({ from: gone.id, to: user.id });
    await User.deleteOne({ _id: gone.id });

    const response = await accept(user.id, sent.id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'That account no longer exists' });
    expect(await FriendRequest.countDocuments()).toBe(0);
  });
});

// Interface DELETE /friends/requests/:id
describe('Unmocked: DELETE /friends/requests/:id', () => {
  // Input: a request sent to the user (declining) and one the user sent (cancelling)
  // Expected status code: 204
  // Expected behavior: the request is removed and no friendship is made
  // Expected output: empty body
  test.each(['declines', 'cancels'] as const)('The user %s a request', async (action) => {
    const user = await createUser();
    const other = await createUser();
    const sent = action === 'declines'
      ? await FriendRequest.create({ from: other.id, to: user.id })
      : await FriendRequest.create({ from: user.id, to: other.id });

    const response = await remove(user.id, sent.id);

    expect(response.status).toBe(204);
    expect(await FriendRequest.countDocuments()).toBe(0);
    expect(await friendIdsOf(user.id)).toEqual([]);
  });

  // Input: a request between two other users, an unknown id, and a malformed id
  // Expected status code: 404, 404 and 400
  // Expected behavior: the request stays
  // Expected output: an error
  test.each([
    ["someone else's", 404],
    ['unknown', 404],
    ['malformed', 400],
  ] as const)('Rejects a request that is %s', async (kind, status) => {
    const user = await createUser();
    const theirs = await FriendRequest.create({ from: (await createUser()).id, to: (await createUser()).id });
    const id = { "someone else's": theirs.id, unknown: UNKNOWN_ID, malformed: 'nope' }[kind];

    const response = await remove(user.id, id);

    expect(response.status).toBe(status);
    expect(response.body.error).toEqual(expect.any(String));
    expect(await FriendRequest.countDocuments()).toBe(1);
  });
});

// Interfaces GET, POST /friends/requests, POST /friends/requests/:id/accept and DELETE /friends/requests/:id
describe('Unmocked: friend request endpoints without sign-in', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: the request is rejected before the handler runs
  // Expected output: an error
  test.each([
    ['get', '/friends/requests'],
    ['post', '/friends/requests'],
    ['post', `/friends/requests/${UNKNOWN_ID}/accept`],
    ['delete', `/friends/requests/${UNKNOWN_ID}`],
  ] as const)('%s %s requires sign-in', async (method, path) => {
    const response = await request(app)[method](path).send({ email: 'a@b.c' });

    expect(response.status).toBe(401);
  });
});
