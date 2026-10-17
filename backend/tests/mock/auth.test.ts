import { jest } from '@jest/globals';
import { LoginTicket, OAuth2Client, type TokenPayload } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';

const app = createApp();

const GOOGLE_PROFILE: TokenPayload = {
  iss: 'https://accounts.google.com',
  aud: 'test-google-client-id.apps.googleusercontent.com',
  sub: '109876543210987654321',
  iat: 0,
  exp: 0,
  email: 'jane@example.com',
  given_name: 'Jane',
  family_name: 'Doe',
};

// Makes Google accept the sign-in and return the given profile (or no profile).
function mockGoogleVerification(payload: TokenPayload | undefined) {
  return jest
    .spyOn(OAuth2Client.prototype, 'verifyIdToken')
    .mockImplementation(async () => new LoginTicket(undefined, payload));
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /auth/google
describe('Mocked: POST /auth/google', () => {
  // Mocked behavior: Google verifies the token and returns Jane's profile
  // Input: { idToken } for a Google account that has never signed in
  // Expected status code: 200
  // Expected behavior: a new user is created with the Google profile
  // Expected output: { accessToken } whose subject is the new user's id and that works on protected routes
  test('First sign-in creates the user', async () => {
    const verify = mockGoogleVerification(GOOGLE_PROFILE);

    const response = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });

    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledTimes(1);
    const user = await User.findOne({ googleId: GOOGLE_PROFILE.sub });
    expect(user).toMatchObject({ email: 'jane@example.com', givenName: 'Jane', familyName: 'Doe' });
    const token = jwt.verify(response.body.accessToken, env.jwtAccessSecret) as { sub: string };
    expect(token.sub).toBe(user?.id);
    const closet = await request(app).get('/clothing').set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(closet.status).toBe(200);
  });

  // Mocked behavior: Google verifies the token; the user's name changed since last sign-in
  // Input: { idToken } for a Google account that already signed in
  // Expected status code: 200
  // Expected behavior: the existing user is updated, no duplicate is created
  // Expected output: { accessToken } for the same user id
  test('Repeat sign-in updates the existing user', async () => {
    mockGoogleVerification(GOOGLE_PROFILE);
    const first = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });
    mockGoogleVerification({ ...GOOGLE_PROFILE, given_name: 'Janet' });

    const second = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });

    expect(second.status).toBe(200);
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findOne())?.givenName).toBe('Janet');
    const firstSub = (jwt.decode(first.body.accessToken) as { sub: string }).sub;
    const secondSub = (jwt.decode(second.body.accessToken) as { sub: string }).sub;
    expect(secondSub).toBe(firstSub);
  });

  // Mocked behavior: Google verifies the token; the profile has no email or name
  // Input: { idToken }
  // Expected status code: 200
  // Expected behavior: the user is created with only their Google id
  // Expected output: { accessToken }
  test('Profile without email or name', async () => {
    mockGoogleVerification({ iss: GOOGLE_PROFILE.iss, aud: GOOGLE_PROFILE.aud, sub: 'minimal-profile', iat: 0, exp: 0 });

    const response = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('accessToken');
    const user = await User.findOne({ googleId: 'minimal-profile' });
    expect(user?.email).toBeUndefined();
    expect(user?.givenName).toBeUndefined();
  });

  // Mocked behavior: Google verifies the token but returns no profile
  // Input: { idToken }
  // Expected status code: 401
  // Expected behavior: no user is created
  // Expected output: { error: "Sign-in failed" }
  test('Google returns no profile', async () => {
    mockGoogleVerification(undefined);

    const response = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Sign-in failed' });
    expect(await User.countDocuments()).toBe(0);
  });

  // Mocked behavior: Google verifies the token, but saving the user throws a database error
  // Input: { idToken }
  // Expected status code: 500
  // Expected behavior: the error is handled and reported as a server error, not a sign-in failure
  // Expected output: { error: "Internal server error" }
  test('Database error while saving the user', async () => {
    mockGoogleVerification(GOOGLE_PROFILE);
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app).post('/auth/google').send({ idToken: 'google-id-token' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
