import type { NextFunction, Request, Response } from 'express';
import { ClassifierNotConfiguredError, ClassifierUnavailableError } from '../services/classifier.js';
import { StorageNotConfiguredError } from '../services/storage.js';

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
  if (err instanceof StorageNotConfiguredError) {
    return res.status(503).json({ error: 'File storage is not available' });
  }
  if (err instanceof ClassifierNotConfiguredError || err instanceof ClassifierUnavailableError) {
    if (err instanceof ClassifierUnavailableError) {
      console.error('Photo classification failed:', err.cause ?? err.message);
    }
    return res.status(503).json({ error: 'Photo classification is not available right now' });
  }
  // e.g. malformed or too-large JSON bodies rejected by express.json()
  if (isClientError(err)) {
    const message = err.expose === true && err.message ? err.message : 'Bad request';
    return res.status(err.status).json({ error: message });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
