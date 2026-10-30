import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { OUTFIT_LIMITS, type OutfitOccasion } from '../models/outfit.js';
import type { Weather } from './weather.js';

export interface OutfitCandidate {
  id: string;
  name: string;
  category: string;
  color: string;
  style: string;
  tags: string[];
}

export interface OutfitRequest {
  occasion: OutfitOccasion;
  weather: Weather | null;
  items: OutfitCandidate[];
}

export interface GeneratedOutfit {
  name: string;
  itemIds: string[];
}

export interface OutfitGenerator {
  generate(request: OutfitRequest): Promise<GeneratedOutfit>;
}

export const OUTFIT_MODEL = 'claude-sonnet-5-5';
// Generation takes a few seconds, so a request still running after this is treated as unavailable.
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
// Far more than an outfit's name and item ids need, so the reply is never cut off.
const MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_NAME = 'Daily outfit';

export class OutfitGeneratorNotConfiguredError extends Error {
  constructor() {
    super('Outfit generation is not configured (set ANTHROPIC_API_KEY)');
    this.name = 'OutfitGeneratorNotConfiguredError';
  }
}

export class OutfitGeneratorUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OutfitGeneratorUnavailableError';
  }
}

const SYSTEM_PROMPT = `You are the stylist in a digital wardrobe app. Each request lists the clean clothes in a user's closet, the occasion they are dressing for and, when it is known, the current weather where they are.

Put together one complete outfit using only the listed items, referring to each item by its id:
- Include a top and a bottom, or a dress instead of both.
- Add shoes, outerwear and accessories when the closet has suitable ones. Add outerwear when it is cold, wet or windy.
- Choose items whose style suits the occasion and whose colours go well together.
- Use each item at most once.

Also give the outfit a short, friendly name, e.g. "Rainy day layers" (at most ${OUTFIT_LIMITS.nameLength} characters).`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    itemIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'itemIds'],
  additionalProperties: false,
};

function describeRequest({ occasion, weather, items }: OutfitRequest): string {
  const weatherLine =
    weather === null ? 'Weather: unknown' : `Weather: ${weather.temperatureC}°C, ${weather.description}`;
  return `Occasion: ${occasion}\n${weatherLine}\nClean clothes:\n${JSON.stringify(items)}`;
}

function parseOutfit(response: Anthropic.Beta.BetaMessage, request: OutfitRequest): GeneratedOutfit {
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  // A refusal also ends up here: the closet can't be turned into an outfit right now.
  if (response.stop_reason !== 'end_turn' || text.length === 0) {
    throw new OutfitGeneratorUnavailableError(`Unexpected outfit generator response (stop reason: ${response.stop_reason})`);
  }

  let output: { name: string; itemIds: string[] };
  try {
    output = JSON.parse(text) as typeof output;
  } catch (err) {
    throw new OutfitGeneratorUnavailableError('Outfit generator returned invalid JSON', { cause: err });
  }
  // Claude can repeat an item or invent an id.
  const candidateIds = new Set(request.items.map((item) => item.id));
  const itemIds = [...new Set(output.itemIds)].filter((id) => candidateIds.has(id)).slice(0, OUTFIT_LIMITS.maxItems);
  if (itemIds.length === 0) {
    throw new OutfitGeneratorUnavailableError('Outfit generator picked none of the closet items');
  }
  const name = output.name.trim().replace(/\s+/g, ' ').slice(0, OUTFIT_LIMITS.nameLength).trim();
  return { name: name.length > 0 ? name : DEFAULT_NAME, itemIds };
}

export function createOutfitGenerator(client: Anthropic): OutfitGenerator {
  return {
    async generate(request) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: OUTFIT_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          // Retries a declined request on another model inside the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: describeRequest(request) }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        });
      } catch (err) {
        throw new OutfitGeneratorUnavailableError('Outfit generation is unavailable right now', { cause: err });
      }
      return parseOutfit(response, request);
    },
  };
}

let defaultGenerator: OutfitGenerator | undefined;

// undefined goes back to the generator configured from the environment.
export function setOutfitGenerator(generator: OutfitGenerator | undefined): void {
  defaultGenerator = generator;
}

export function getOutfitGenerator(): OutfitGenerator {
  if (defaultGenerator === undefined) {
    if (env.anthropicApiKey === undefined) {
      throw new OutfitGeneratorNotConfiguredError();
    }
    defaultGenerator = createOutfitGenerator(
      new Anthropic({ apiKey: env.anthropicApiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES })
    );
  }
  return defaultGenerator;
}
