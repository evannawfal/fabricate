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
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

const MEASUREMENTS = { height: 1.75, shoulderWidth: 0.4, chestWidth: 0.35, waistWidth: 0.3, hipWidth: 0.32 };

// Interface POST /avatar
// File storage isn't configured in these tests, so everything here is checked before a model
// would be generated or stored. The full flow is in tests/mock/avatar.test.ts.
describe('Unmocked: POST /avatar', () => {
  // Input: valid measurements, no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).post('/avatar').send(MEASUREMENTS);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });

  // Input: a JSON array instead of an object
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Request body must be a JSON object" }
  test('Body is not an object', async () => {
    const user = await createUser();

    const response = await request(app).post('/avatar').set('Authorization', authHeader(user.id)).send([1.75]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request body must be a JSON object' });
  });

  // Input: valid measurements plus a resolution (users can't choose how detailed the model is)
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Unknown field: resolution" }
  test('Unknown field', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/avatar')
      .set('Authorization', authHeader(user.id))
      .send({ ...MEASUREMENTS, resolution: 0.001 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Unknown field: resolution' });
  });

  // Input: one invalid measurement at a time (missing, not a number, too small, too large)
  // Expected status code: 400
  // Expected behavior: request is rejected; the user's avatar is unchanged
  // Expected output: an error naming the measurement and its allowed range
  test.each([
    [{ height: undefined }, /height should be within 1m and 3m/],
    [{ shoulderWidth: '0.4' }, /shoulderWidth should be within 0.25m and 0.6m/],
    [{ chestWidth: 0.05 }, /chestWidth should be within 0.1m and 1m/],
    [{ waistWidth: 2.5 }, /waistWidth should be within 0.1m and 2m/],
    [{ hipWidth: -1 }, /hipWidth should be within 0.1m and 1.5m/],
  ])('Invalid measurement %j', async (change, expectedError) => {
    const user = await createUser();

    const response = await request(app)
      .post('/avatar')
      .set('Authorization', authHeader(user.id))
      .send({ ...MEASUREMENTS, ...change });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    expect((await User.findById(user.id))?.avatarModelKey).toBeNull();
  });

  // Input: valid measurements while file storage isn't configured
  // Expected status code: 503
  // Expected behavior: no model is generated or stored; the user's avatar is unchanged
  // Expected output: { error: "File storage is not available" }
  test('Storage not configured', async () => {
    const user = await createUser();

    const response = await request(app).post('/avatar').set('Authorization', authHeader(user.id)).send(MEASUREMENTS);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'File storage is not available' });
    expect((await User.findById(user.id))?.avatarModelKey).toBeNull();
  });
});
