import { jest } from '@jest/globals';
import type { Response } from 'express';
import { MulterError } from 'multer';

import { errorHandler } from '../../src/middleware/errorHandler.js';

function mockResponse(headersSent = false) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { res: { status, headersSent } as unknown as Response, status, json };
}

describe('Error handler', () => {
  // Input: an error after the response has started being sent
  // Expected behavior: the error is passed on to Express's default handler, nothing is written
  test('Response already started', () => {
    const { res, status } = mockResponse(true);
    const next = jest.fn();
    const error = new Error('Stream failed');

    errorHandler(error, {} as never, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(status).not.toHaveBeenCalled();
  });

  // Input: an upload error that isn't about a single form field (e.g. too many parts)
  // Expected status code: 400
  // Expected output: the upload error, without a field name
  test('Upload error without a field', () => {
    const { res, status, json } = mockResponse();

    errorHandler(new MulterError('LIMIT_PART_COUNT'), {} as never, res, () => undefined);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid upload: Too many parts' });
  });

  // Input: a client error whose message isn't safe to show
  // Expected status code: the error's status
  // Expected output: { error: "Bad request" }
  test('Client error with a hidden message', () => {
    const { res, status, json } = mockResponse();

    errorHandler({ status: 415, expose: false, message: 'Internal parser detail' }, {} as never, res, () => undefined);

    expect(status).toHaveBeenCalledWith(415);
    expect(json).toHaveBeenCalledWith({ error: 'Bad request' });
  });
});
