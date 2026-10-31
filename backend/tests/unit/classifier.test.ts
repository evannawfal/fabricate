import { jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';

import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  CLASSIFIER_MODEL,
  ClassifierNotConfiguredError,
  ClassifierUnavailableError,
  createClothingClassifier,
  getClothingClassifier,
  InvalidImageError,
  isClassifierConfigured,
  MAX_IMAGE_BYTES,
  UnclassifiablePhotoError,
} from '../../src/services/classifier.js';

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

// A stand-in for the Anthropic client: nothing is sent to the API.
function fakeClient(result: Anthropic.Beta.BetaMessage | Error) {
  const create = jest.fn<(params: CreateParams) => Promise<Anthropic.Beta.BetaMessage>>();
  if (result instanceof Error) {
    create.mockRejectedValue(result);
  } else {
    create.mockResolvedValue(result);
  }
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  return { client, create };
}

function claudeResponse(
  output: unknown,
  stopReason: Anthropic.Beta.BetaMessage['stop_reason'] = 'end_turn'
): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: CLASSIFIER_MODEL,
    stop_reason: stopReason,
    content: output === undefined ? [] : [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }],
  } as unknown as Anthropic.Beta.BetaMessage;
}

const JACKET = { isClothing: true, name: 'Navy wool overcoat', category: 'outerwear', color: 'navy', style: 'formal' };

function mockResponse() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { res: { status } as unknown as Response, status, json };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Clothing photo classifier', () => {
  // Mocked behavior: Claude returns a classification for a jacket photo
  // Input: a JPEG photo
  // Expected behavior: one request to the classifier model with the photo, the JSON schema and low effort
  // Expected output: { name, category, color, style }
  test('Classifies a clothing photo', async () => {
    const { client, create } = fakeClient(claudeResponse(JACKET));

    const result = await createClothingClassifier(client).classify(PHOTO, 'image/jpeg');

    expect(result).toEqual({ name: 'Navy wool overcoat', category: 'outerwear', color: 'navy', style: 'formal' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5-5',
        fallbacks: 'default',
        output_config: { effort: 'low', format: expect.objectContaining({ type: 'json_schema' }) },
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(PHOTO).toString('base64') },
              },
            ]),
          }),
        ],
      })
    );
  });

  // Mocked behavior: Claude returns fields with extra spaces, capitals and an overlong name
  // Input: a PNG photo
  // Expected behavior: fields are tidied and kept within the closet item's limits
  // Expected output: trimmed, lowercase colour and style; name cut to 100 characters
  test('Cleans up the returned fields', async () => {
    const { client } = fakeClient(
      claudeResponse({ isClothing: true, name: `  ${'Long '.repeat(40)} `, category: 'top', color: ' Light   GREY ', style: 'Smart Casual' })
    );

    const result = await createClothingClassifier(client).classify(PHOTO, 'image/png');

    expect(result.name.length).toBeLessThanOrEqual(100);
    expect(result.name.startsWith('Long Long')).toBe(true);
    expect(result.color).toBe('light grey');
    expect(result.style).toBe('smart casual');
  });

  // Mocked behavior: Claude says the photo isn't clothing
  // Input: a photo of something else
  // Expected behavior: rejected as unclassifiable (422)
  test('Rejects photos that are not clothing', async () => {
    const { client } = fakeClient(claudeResponse({ ...JACKET, isClothing: false }));

    await expect(createClothingClassifier(client).classify(PHOTO, 'image/jpeg')).rejects.toThrow(UnclassifiablePhotoError);
  });

  // Mocked behavior: the request is declined (refusal), even after the fallback model
  // Input: a photo
  // Expected behavior: rejected as unclassifiable (422), since retrying won't help
  test('Declined photos are unclassifiable', async () => {
    const { client } = fakeClient(claudeResponse(undefined, 'refusal'));

    await expect(createClothingClassifier(client).classify(PHOTO, 'image/jpeg')).rejects.toThrow(
      new UnclassifiablePhotoError('This photo could not be classified')
    );
  });

  // Mocked behavior: Claude's answer is cut off or isn't valid JSON / uses an unknown category
  // Input: a photo
  // Expected behavior: reported as the classifier being unavailable (503)
  test.each([
    ['cut off at max_tokens', claudeResponse('{"isClothing": tr', 'max_tokens')],
    ['not JSON', claudeResponse('Looks like a jacket')],
    ['unknown category', claudeResponse({ ...JACKET, category: 'hat' })],
  ])('Unusable answer: %s', async (_label, response) => {
    const { client } = fakeClient(response);

    await expect(createClothingClassifier(client).classify(PHOTO, 'image/jpeg')).rejects.toThrow(ClassifierUnavailableError);
  });

  // Mocked behavior: the API is rate limited, times out, or fails
  // Input: a photo
  // Expected behavior: reported as the classifier being unavailable (503), with the cause kept for logs
  test.each([
    ['rate limited', new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers())],
    ['timed out', new Anthropic.APIConnectionTimeoutError()],
    ['server error', new Anthropic.InternalServerError(500, {}, 'overloaded', new Headers())],
    ['bad API key', new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers())],
  ])('API failure: %s', async (_label, error) => {
    const { client } = fakeClient(error);

    const failure = createClothingClassifier(client).classify(PHOTO, 'image/jpeg');

    await expect(failure).rejects.toThrow(ClassifierUnavailableError);
    await expect(failure).rejects.toHaveProperty('cause', error);
  });

  // Mocked behavior: the API rejects the request (e.g. a corrupt image)
  // Input: a photo the API can't read
  // Expected behavior: reported as an invalid image (400)
  test('API rejects the image', async () => {
    const { client } = fakeClient(new Anthropic.BadRequestError(400, {}, 'Could not process image', new Headers()));

    await expect(createClothingClassifier(client).classify(PHOTO, 'image/jpeg')).rejects.toThrow(InvalidImageError);
  });

  // Input: an unsupported format, an empty file, or a file over 5 MB
  // Expected behavior: rejected as an invalid image (400) without calling the API
  test.each([
    ['unsupported type', PHOTO, 'image/heic'],
    ['empty file', new Uint8Array(), 'image/jpeg'],
    ['too large', new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/jpeg'],
  ])('Invalid photo: %s', async (_label, image, mediaType) => {
    const { client, create } = fakeClient(claudeResponse(JACKET));

    await expect(createClothingClassifier(client).classify(image, mediaType)).rejects.toThrow(InvalidImageError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('Classifier configuration and errors', () => {
  // Input: no ANTHROPIC_API_KEY configured (as in tests and fresh clones)
  // Expected behavior: the classifier reports itself as not configured instead of failing at startup
  test('Not configured', () => {
    expect(isClassifierConfigured()).toBe(false);
    expect(() => getClothingClassifier()).toThrow(ClassifierNotConfiguredError);
  });

  // Input: classifier errors reaching the error handler
  // Expected status code: 503 for configuration/availability problems, 400/422 for photo problems
  // Expected output: a JSON error message
  test.each([
    [new ClassifierNotConfiguredError(), 503, 'Photo classification is not available right now'],
    [new ClassifierUnavailableError('down'), 503, 'Photo classification is not available right now'],
    [new InvalidImageError('The image is empty'), 400, 'The image is empty'],
    [new UnclassifiablePhotoError('The photo does not show a clothing item'), 422, 'The photo does not show a clothing item'],
  ])('Reported to the app: %s', (error, status, message) => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, status: setStatus, json } = mockResponse();

    errorHandler(error, {} as never, res, () => undefined);

    expect(setStatus).toHaveBeenCalledWith(status);
    expect(json).toHaveBeenCalledWith({ error: message });
  });
});
