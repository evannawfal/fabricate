import type { Request, Response } from 'express';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.js';

const client = new OAuth2Client(env.googleClientId);

async function verifyGoogleToken(idToken: string): Promise<TokenPayload | undefined> {
  try {
    // Makes sure the token ID is verified
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    return ticket.getPayload();
  } catch (err) {
    console.error('Google sign-in failed:', err);
    return undefined;
  }
}

export async function googleSignIn(req: Request, res: Response) {
  const { idToken } = (req.body ?? {}) as { idToken?: unknown };
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return res.status(400).json({ error: 'Missing idToken' });
  }

  const payload = await verifyGoogleToken(idToken);
  if (!payload) {
    return res.status(401).json({ error: 'Sign-in failed' });
  }

  // Creates the user on first sign-in and keeps their Google profile up to date.
  const profile: Record<string, string> = {};
  if (payload.email !== undefined) profile.email = payload.email;
  if (payload.given_name !== undefined) profile.givenName = payload.given_name;
  if (payload.family_name !== undefined) profile.familyName = payload.family_name;
  const user = await User.findOneAndUpdate(
    { googleId: payload.sub },
    { $set: profile },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

  // Signs access token, short-lived. `sub` is our user id, not the Google id.
  const accessToken = jwt.sign(
    {
      sub: user._id.toString(),
      email: payload.email,
      givenName: payload.given_name,
      familyName: payload.family_name,
    },
    env.jwtAccessSecret,
    { expiresIn: '30m' }
  );
  res.json({ accessToken });
}
