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

  try {
    // Signs token for every request
    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub?: unknown };
    // Tokens identify users by their database id
    if (!isObjectId(payload.sub)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// For handlers mounted behind requireAuth.
export function getUserId(req: AuthedRequest): string {
  if (req.userId === undefined) {
    throw new Error('getUserId called on a route without requireAuth');
  }
  return req.userId;
}