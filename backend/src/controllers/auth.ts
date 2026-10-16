import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const client = new OAuth2Client(env.googleClientId);

export async function googleSignIn(req: Request, res: Response) {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    // Makes sure the token ID is verified
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    // Signs access token, short-lived
    const accessToken = jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        givenName: payload.given_name,
        familyName: payload.family_name,
      },
      env.jwtAccessSecret,
      { expiresIn: '30m' }
    );
    res.json({ accessToken });
  } catch (err) {
    console.error('Google sign-in failed:', err);
    res.status(401).json({ error: 'Sign-in failed' });
  }
}