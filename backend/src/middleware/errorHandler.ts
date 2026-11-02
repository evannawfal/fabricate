import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { CatalogNotConfiguredError, CatalogUnavailableError } from '../services/catalog.js';
import { ClassifierNotConfiguredError, ClassifierUnavailableError, MAX_IMAGE_BYTES } from '../services/classifier.js';
import { OutfitGeneratorNotConfiguredError, OutfitGeneratorUnavailableError } from '../services/outfitGenerator.js';
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
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  // A response that has already started can't be replaced, so Express's default handler closes it.
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof StorageNotConfiguredError) {
    return res.status(503).json({ error: 'File storage is not available' });
  }
  if (err instanceof ClassifierNotConfiguredError || err instanceof ClassifierUnavailableError) {
    if (err instanceof ClassifierUnavailableError) {
      console.error('Photo classification failed:', err.cause ?? err.message);
    }
    return res.status(503).json({ error: 'Photo classification is not available right now' });
  }
  if (err instanceof OutfitGeneratorNotConfiguredError || err instanceof OutfitGeneratorUnavailableError) {
    // A missing API key is a known setup state, so only actual failures are logged.
    if (err instanceof OutfitGeneratorUnavailableError) {
      console.error('Outfit generation failed:', err.cause ?? err.message);
    }
    return res.status(503).json({ error: 'Outfit generation is not available right now' });
  }
  if (err instanceof CatalogNotConfiguredError || err instanceof CatalogUnavailableError) {
    if (err instanceof CatalogUnavailableError) {
      console.error('Store search failed:', err.cause ?? err.message);
    }
    return res.status(503).json({ error: 'Store search is not available right now' });
  }
  // Problems with an uploaded file (too large, wrong field name, more than one file, ...)
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `The photo must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)} MB` });
    }
    return res.status(400).json({ error: `Invalid upload: ${err.message}${err.field ? ` (${err.field})` : ''}` });
  }
  // e.g. malformed or too-large JSON bodies rejected by express.json()
  if (isClientError(err)) {
    const message = err.expose === true && err.message ? err.message : 'Bad request';
    return res.status(err.status).json({ error: message });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
