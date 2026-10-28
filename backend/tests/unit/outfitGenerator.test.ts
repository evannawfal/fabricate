import { jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';

import { env } from '../../src/config/env.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  createOutfitGenerator,
  getOutfitGenerator,
  OUTFIT_MODEL,
  OutfitGeneratorNotConfiguredError,
  OutfitGeneratorUnavailableError,
  setOutfitGenerator,
  type OutfitRequest,
} from '../../src/services/outfitGenerator.js';

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

const SHIRT = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'White oxford shirt', category: 'top', color: 'white', style: 'business', tags: [] };
const CHINOS = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Navy chinos', category: 'bottom', color: 'navy', style: 'business', tags: ['slim'] };
const RAINCOAT = { id: 'cccccccccccccccccccccccc', name: 'Olive raincoat', category: 'outerwear', color: 'olive', style: 'outdoor', tags: [] };

const REQUEST: OutfitRequest = {
  occasion: 'work',
  weather: { temperatureC: 9, condition: 'Rain', description: 'light rain' },
  items: [SHIRT, CHINOS, RAINCOAT],
};

// A stand-in for the Anthropic client: nothing is sent to the API.
function fakeClient(result: Anthropic.Beta.BetaMessage | Error) {
  const create = jest.fn(async (_params: CreateParams) => {
    if (result instanceof Error) throw result;
    return result;
  });
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  return { client, create };
}

// An undefined output gives a reply with no text, like a refusal.
function claudeResponse(
  output: unknown,
  stopReason: Anthropic.Beta.BetaMessage['stop_reason'] = 'end_turn'
): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: OUTFIT_MODEL,
    stop_reason: stopReason,
    content: output === undefined ? [] : [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }],
  } as unknown as Anthropic.Beta.BetaMessage;
}

function sentMessage(create: ReturnType<typeof fakeClient>['create']): string {
  const params = create.mock.calls[0]?.[0] as CreateParams;
  return params.messages[0]?.content as string;
}

function mockResponse() {
  const json = jest.fn();
  const res = { status: jest.fn(() => ({ json })) } as unknown as Response;
  return { res, json };
}

afterEach(() => {
  setOutfitGenerator(undefined);
  jest.restoreAllMocks();
});

describe('Outfit generator', () => {
  // Mocked behavior: Claude picks the shirt, chinos and raincoat for a rainy work day
  // Input: occasion "work", light rain at 9°C, three clean items
  // Expected behavior: one request to the outfit model with the occasion, weather and items, the JSON schema and low effort
  // Expected output: the outfit's name and item ids, in Claude's order
  test('Generates an outfit', async () => {
    const { client, create } = fakeClient(
      claudeResponse({ name: 'Rainy office day', itemIds: [RAINCOAT.id, SHIRT.id, CHINOS.id] })
    );

    const outfit = await createOutfitGenerator(client).generate(REQUEST);

    expect(outfit).toEqual({ name: 'Rainy office day', itemIds: [RAINCOAT.id, SHIRT.id, CHINOS.id] });
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0] as CreateParams;
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config?.effort).toBe('low');
    expect(params.output_config?.format?.type).toBe('json_schema');
    expect(params.fallbacks).toBe('default');
    const message = sentMessage(create);
    expect(message).toContain('Occasion: work');
    expect(message).toContain('Weather: 9°C, light rain');
    expect(message).toContain(JSON.stringify(REQUEST.items));
  });

  // Mocked behavior: Claude picks the shirt and chinos
  // Input: no weather (it couldn't be retrieved)
  // Expected behavior: Claude is told the weather is unknown
  // Expected output: the outfit
  test('Without the weather', async () => {
    const { client, create } = fakeClient(claudeResponse({ name: 'Office basics', itemIds: [SHIRT.id, CHINOS.id] }));

    const outfit = await createOutfitGenerator(client).generate({ ...REQUEST, weather: null });

    expect(outfit.itemIds).toEqual([SHIRT.id, CHINOS.id]);
    expect(sentMessage(create)).toContain('Weather: unknown');
  });

  // Mocked behavior: Claude repeats an item and includes an id that isn't one of the user's clean items
  // Input: three clean items
  // Expected behavior: only the user's clean items are kept, each once
  // Expected output: the outfit without the unknown id and the repeat
  test('Keeps only the clean items, each once', async () => {
    const { client } = fakeClient(
      claudeResponse({ name: 'Look', itemIds: [SHIRT.id, 'dddddddddddddddddddddddd', SHIRT.id, CHINOS.id] })
    );

    const outfit = await createOutfitGenerator(client).generate(REQUEST);

    expect(outfit.itemIds).toEqual([SHIRT.id, CHINOS.id]);
  });

  // Mocked behavior: Claude returns a blank or overly long name
  // Input: three clean items
  // Expected behavior: the name is tidied to fit the outfit's name limit
  // Expected output: the default name, or the name cut to 100 characters
  test.each([
    ['   ', 'Daily outfit'],
    ['  Rainy   day\nlayers ', 'Rainy day layers'],
    ['x'.repeat(150), 'x'.repeat(100)],
  ])('Name %j', async (name, expectedName) => {
    const { client } = fakeClient(claudeResponse({ name, itemIds: [SHIRT.id, CHINOS.id] }));

    const outfit = await createOutfitGenerator(client).generate(REQUEST);

    expect(outfit.name).toBe(expectedName);
  });

  // Mocked behavior: Claude can't be reached, declines, runs out of tokens, or returns unusable output
  // Input: three clean items
  // Expected behavior: the problem is reported as the generator being unavailable (503 for the app)
  // Expected output: OutfitGeneratorUnavailableError
  test.each([
    ['API error', new Anthropic.APIConnectionError({ message: 'Connection error.' })],
    ['Refusal', claudeResponse(undefined, 'refusal')],
    ['Out of tokens', claudeResponse('{"name": "Lo', 'max_tokens')],
    ['Invalid JSON', claudeResponse('not json')],
    ['No closet items picked', claudeResponse({ name: 'Look', itemIds: ['dddddddddddddddddddddddd'] })],
  ])('%s', async (_name, result) => {
    const { client } = fakeClient(result);

    await expect(createOutfitGenerator(client).generate(REQUEST)).rejects.toThrow(OutfitGeneratorUnavailableError);
  });

  // Input: no ANTHROPIC_API_KEY (as in the tests)
  // Expected behavior: the generator reports itself as not configured instead of failing at startup
  test('Not configured', () => {
    expect(() => getOutfitGenerator()).toThrow(OutfitGeneratorNotConfiguredError);
  });

  // Input: ANTHROPIC_API_KEY is set
  // Expected behavior: the app-wide generator is created once and reused (no request is sent)
  test('Configured from the environment', () => {
    jest.replaceProperty(env, 'anthropicApiKey', 'test-key');

    const generator = getOutfitGenerator();

    expect(getOutfitGenerator()).toBe(generator);
  });

  // Input: generator errors reaching the error handler
  // Expected status code: 503
  // Expected output: { error: "Outfit generation is not available right now" }
  test.each([new OutfitGeneratorNotConfiguredError(), new OutfitGeneratorUnavailableError('down')])(
    'Reported to the app: %s',
    (error) => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { res, json } = mockResponse();

      errorHandler(error, {} as never, res, () => undefined);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(json).toHaveBeenCalledWith({ error: 'Outfit generation is not available right now' });
    }
  );
});
