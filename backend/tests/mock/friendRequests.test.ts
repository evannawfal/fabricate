import { jest } from '@jest/globals';
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
import { authHeader, createUser } from '../helpers/fixtures.js';

const app = createApp();

function failUserCall(method: 'findOne' | 'countDocuments' | 'findById' | 'updateOne') {
  return jest.spyOn(User, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

function failRequestCall(method: 'find' | 'findOne' | 'findById' | 'create' | 'deleteOne') {
  return jest.spyOn(FriendRequest, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
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

// Interface GET /friends/requests
describe('Mocked: GET /friends/requests', () => {
  // Mocked behavior: FriendRequest.find throws
  // Input: a signed-in user
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test('Friend request DB error while listing', async () => {
    const user = await createUser();
    failRequestCall('find');

    expectInternalError(await request(app).get('/friends/requests').set('Authorization', authHeader(user.id)));
  });
});

// Interface POST /friends/requests
describe('Mocked: POST /friends/requests', () => {
  // Mocked behavior: User.findOne throws while looking up the email, User.countDocuments while checking
  // for a friendship, FriendRequest.findOne while checking for their request, or FriendRequest.create
  // with an error other than a duplicate request
  // Input: another user's email
  // Expected status code: 500
  // Expected behavior: the error is handled and logged, and no request is saved
  // Expected output: { error: "Internal server error" }
  test.each([
    ['User.findOne', () => failUserCall('findOne')],
    ['User.countDocuments', () => failUserCall('countDocuments')],
    ['FriendRequest.findOne', () => failRequestCall('findOne')],
    ['FriendRequest.create', () => failRequestCall('create')],
  ] as const)('DB error in %s', async (_call, failCall) => {
    const user = await createUser();
    const other = await createUser();
    failCall();

    const response = await request(app)
      .post('/friends/requests')
      .set('Authorization', authHeader(user.id))
      .send({ email: other.email });

    expectInternalError(response);
  });

  // Mocked behavior: User.updateOne throws while making the friendship, or FriendRequest.deleteOne
  // while removing the accepted request
  // Input: the email of a user who already sent the user a request
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test.each([
    ['User.updateOne', () => failUserCall('updateOne')],
    ['FriendRequest.deleteOne', () => failRequestCall('deleteOne')],
  ] as const)('DB error in %s while accepting their request', async (_call, failCall) => {
    const user = await createUser();
    const other = await createUser();
    await FriendRequest.create({ from: other.id, to: user.id });
    failCall();

    const response = await request(app)
      .post('/friends/requests')
      .set('Authorization', authHeader(user.id))
      .send({ email: other.email });

    expectInternalError(response);
  });
});

// Interface POST /friends/requests/:id/accept
describe('Mocked: POST /friends/requests/:id/accept', () => {
  // Mocked behavior: FriendRequest.findById throws while loading the request, User.findById while
  // loading the sender, User.updateOne while making the friendship, or FriendRequest.deleteOne while
  // removing the request
  // Input: a request sent to the user
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test.each([
    ['FriendRequest.findById', () => failRequestCall('findById')],
    ['User.findById', () => failUserCall('findById')],
    ['User.updateOne', () => failUserCall('updateOne')],
    ['FriendRequest.deleteOne', () => failRequestCall('deleteOne')],
  ] as const)('DB error in %s', async (_call, failCall) => {
    const user = await createUser();
    const sender = await createUser();
    const sent = await FriendRequest.create({ from: sender.id, to: user.id });
    failCall();

    const response = await request(app)
      .post(`/friends/requests/${sent.id}/accept`)
      .set('Authorization', authHeader(user.id));

    expectInternalError(response);
  });
});

// Interface DELETE /friends/requests/:id
describe('Mocked: DELETE /friends/requests/:id', () => {
  // Mocked behavior: FriendRequest.deleteOne throws
  // Input: a request sent to the user
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test('Friend request DB error while removing', async () => {
    const user = await createUser();
    const sent = await FriendRequest.create({ from: (await createUser()).id, to: user.id });
    failRequestCall('deleteOne');

    expectInternalError(await request(app).delete(`/friends/requests/${sent.id}`).set('Authorization', authHeader(user.id)));
  });
});
