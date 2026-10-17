import type { NextFunction, Request, Response } from 'express';

interface HttpError {
  status: number;
  expose?: boolean;
  message?: string;
}

function isClientError(err: unknown): err is HttpError {
  if (typeof err !== 'object' || err === null || !('status' in err)) {
    return false;
  }
  const { status } = err as { status: unknown };
  return typeof status === 'number' && status >= 400 && status < 500;
}

// Last middleware: turns errors into JSON responses instead of Express's default HTML page.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // e.g. malformed or too-large JSON bodies rejected by express.json()
  if (isClientError(err)) {
    const message = err.expose === true && err.message ? err.message : 'Bad request';
    return res.status(err.status).json({ error: message });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
