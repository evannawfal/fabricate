import jwt from 'jsonwebtoken';

import { verifyToken } from '../../src/middleware/middleware.js';
import { authHeader, UNKNOWN_ID } from '../helpers/fixtures.js';

describe('verifyToken', () => {
  test('Returns the user id from a valid token', () => {
    expect(verifyToken(authHeader(UNKNOWN_ID).slice('Bearer '.length))).toBe(UNKNOWN_ID);
  });

  test.each([
    ['missing', undefined],
    ['not a string', 42],
    ['malformed', 'not-a-jwt'],
    ['signed with another secret', jwt.sign({ sub: UNKNOWN_ID }, 'other-secret')],
    ['expired', jwt.sign({ sub: UNKNOWN_ID, exp: 0 }, process.env.JWT_SECRET ?? '')],
    ['subject is not a user id', jwt.sign({ sub: 'someone' }, process.env.JWT_SECRET ?? '')],
  ])('Returns undefined for a token that is %s', (_kind, token) => {
    expect(verifyToken(token)).toBeUndefined();
  });
});
