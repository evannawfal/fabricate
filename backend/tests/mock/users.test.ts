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

// Interface GET /users/me and PATCH /users/me
describe('Mocked: GET and PATCH /users/me', () => {
  // Mocked behavior: User.findById (GET) or User.findByIdAndUpdate (PATCH) throws
  // Input: a signed-in user
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test.each([
    ['get', 'findById'],
    ['patch', 'findByIdAndUpdate'],
  ] as const)('User DB error (%s)', async (method, dbCall) => {
    const user = await createUser();
    jest.spyOn(User, dbCall).mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app)[method]('/users/me').set('Authorization', authHeader(user.id)).send({ pronouns: 'he/him' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });
});
