import request from 'supertest';

import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createUser, UNKNOWN_ID } from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface GET /users/me
describe('Unmocked: GET /users/me', () => {
  // Input: a signed-in user who hasn't set pronouns
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the user's id, name, email and empty pronouns
  test("Returns the user's profile", async () => {
    const user = await createUser();

    const response = await request(app).get('/users/me').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: user.id, name: `Test ${user.familyName}`, email: user.email, pronouns: '' });
  });

  // Input: a valid token for a user that no longer exists
  // Expected status code: 404
  // Expected behavior: nothing changes
  // Expected output: { error: "User not found" }
  test('Unknown user', async () => {
    const response = await request(app).get('/users/me').set('Authorization', authHeader(UNKNOWN_ID));

    expect(response.status).toBe(404);
  });
});

// Interface PATCH /users/me
describe('Unmocked: PATCH /users/me', () => {
  // Input: { pronouns: " they/them " }, then { pronouns: "" }
  // Expected status code: 200
  // Expected behavior: the trimmed pronouns are saved, and an empty string clears them
  // Expected output: the updated profile
  test('Sets and clears pronouns', async () => {
    const user = await createUser();

    const set = await request(app).patch('/users/me').set('Authorization', authHeader(user.id)).send({ pronouns: ' they/them ' });
    expect(set.status).toBe(200);
    expect(set.body.pronouns).toBe('they/them');
    expect((await User.findById(user.id))?.pronouns).toBe('they/them');

    const cleared = await request(app).patch('/users/me').set('Authorization', authHeader(user.id)).send({ pronouns: '' });
    expect(cleared.body.pronouns).toBe('');
  });

  // Input: invalid bodies (wrong type, too long, fields that can't be changed)
  // Expected status code: 400
  // Expected behavior: the profile doesn't change
  // Expected output: an error describing the problem
  test.each([[{ pronouns: 5 }], [{ pronouns: 'x'.repeat(31) }], [{ email: 'a@b.c' }], [[]]])('Invalid body %j', async (body) => {
    const user = await createUser();

    const response = await request(app).patch('/users/me').set('Authorization', authHeader(user.id)).send(body);

    expect(response.status).toBe(400);
    expect((await User.findById(user.id))?.pronouns).toBe('');
  });

  // Input: a valid token for a user that no longer exists
  // Expected status code: 404
  // Expected behavior: no user is created
  // Expected output: { error: "User not found" }
  test('Unknown user', async () => {
    const response = await request(app).patch('/users/me').set('Authorization', authHeader(UNKNOWN_ID)).send({ pronouns: 'she/her' });

    expect(response.status).toBe(404);
    expect(await User.countDocuments()).toBe(0);
  });
});
