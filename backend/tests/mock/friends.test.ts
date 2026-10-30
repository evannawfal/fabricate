import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createUser } from '../helpers/fixtures.js';

const app = createApp();

function failUserCall(method: 'findById' | 'findOne' | 'updateOne') {
  return jest.spyOn(User, method).mockImplementation(() => {
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

// Interface GET /friends
describe('Mocked: GET /friends', () => {
  // Mocked behavior: User.findById throws
  // Input: a signed-in user
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test('User DB error while loading friends', async () => {
    const user = await createUser();
    failUserCall('findById');

    expectInternalError(await request(app).get('/friends').set('Authorization', authHeader(user.id)));
  });
});

// Interface POST /friends
describe('Mocked: POST /friends', () => {
  // Mocked behavior: User.findOne throws while looking up the email, or User.updateOne throws while saving
  // Input: another user's email
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test.each(['findOne', 'updateOne'] as const)('User DB error in %s', async (method) => {
    const user = await createUser();
    const friend = await createUser();
    failUserCall(method);

    const response = await request(app)
      .post('/friends')
      .set('Authorization', authHeader(user.id))
      .send({ email: friend.email });

    expectInternalError(response);
  });
});
