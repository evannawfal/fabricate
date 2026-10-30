import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isObjectId } from '../validation/common.js';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // Make sure requests are sent with correct authorization bearer
  const authHeader = req.headers.authorization;
  const bearer_header = 'Bearer ';
  const token = authHeader?.startsWith(bearer_header)
    ? authHeader.slice(bearer_header.length)
    : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const userId = verifyToken(token);
  if (userId === undefined) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.userId = userId;
  next();
}

// The user id in a valid session token, or undefined.
export function verifyToken(token: unknown): string | undefined {
  if (typeof token !== 'string') return undefined;
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub?: unknown };
    // Tokens identify users by their database id
    return isObjectId(payload.sub) ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

// For handlers mounted behind requireAuth.
export function getUserId(req: AuthedRequest): string {
  if (req.userId === undefined) {
    throw new Error('getUserId called on a route without requireAuth');
  }
  return req.userId;
}