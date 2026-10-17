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

// Interface POST /auth/google
describe('Unmocked: POST /auth/google', () => {
  // Input: request without a body
  // Expected status code: 400
  // Expected behavior: no user is created
  // Expected output: { error: "Missing idToken" }
  test('Missing body', async () => {
    const response = await request(app).post('/auth/google');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing idToken' });
    expect(await User.countDocuments()).toBe(0);
  });

  // Input: idToken that isn't a string
  // Expected status code: 400
  // Expected behavior: no user is created
  // Expected output: { error: "Missing idToken" }
  test('Non-string idToken', async () => {
    const response = await request(app).post('/auth/google').send({ idToken: 123 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing idToken' });
  });

  // Input: idToken that Google can't verify
  // Expected status code: 401
  // Expected behavior: no user is created
  // Expected output: { error: "Sign-in failed" }
  test('Invalid Google token', async () => {
    const response = await request(app).post('/auth/google').send({ idToken: 'not-a-google-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Sign-in failed' });
    expect(await User.countDocuments()).toBe(0);
  });
});

// Protected routes (requireAuth), exercised through GET /clothing
describe('Unmocked: requireAuth on protected routes', () => {
  // Input: valid access token for an existing user
  // Expected status code: 200
  // Expected behavior: request is allowed through
  // Expected output: the user's (empty) closet
  test('Valid token', async () => {
    const user = await createUser();

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
  });

  // Input: Authorization header without the "Bearer " prefix
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Not a bearer token', async () => {
    const user = await createUser();
    const token = authHeader(user.id).replace('Bearer ', '');

    const response = await request(app).get('/clothing').set('Authorization', token);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });

  // Input: tokens that are signed with the wrong secret, expired, or don't contain a user id
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid or expired token" }
  test.each([
    ['wrong secret', (userId: string) => authHeader(userId, { secret: 'some-other-secret' })],
    ['expired', (userId: string) => authHeader(userId, { expiresIn: -10 })],
    ['Google id instead of user id', () => authHeader('112233445566778899000')],
    ['not a JWT', () => 'Bearer not-a-jwt'],
  ])('Rejects token: %s', async (_label, makeHeader) => {
    const user = await createUser();

    const response = await request(app).get('/clothing').set('Authorization', makeHeader(user.id));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired token' });
  });
});
