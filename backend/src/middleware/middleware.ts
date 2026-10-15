import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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
    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}