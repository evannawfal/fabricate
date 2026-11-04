import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { CLOTHING_CATEGORIES, CLOTHING_LIMITS, type ClothingCategory } from '../models/clothingItem.js';
import { MESHES_CATEGORIES } from '../config/constants.js';

// Classifies a clothing item's photos into the fields of a closet item using Claude's vision.
export interface ClothingClassification {
  name: string;
  category: ClothingCategory;
  color: string;
  style: string;
}

// The optional back photo of the same item. It is checked like the front photo.
export interface BackImage {
  image: Uint8Array;
  mediaType: string;
}

export interface ClothingClassifier {
  classify(image: Uint8Array, mediaType: string, back?: BackImage): Promise<ClothingClassification>;
}

export const CLASSIFIER_MODEL = 'claude-sonnet-5-5';
// Image formats Claude accepts, and the API's size limit for an image sent in the request.
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

// Classification problems the app should report as server-side unavailability (503).
export class ClassifierNotConfiguredError extends Error {
  constructor() {
    super('Photo classification is not configured (set ANTHROPIC_API_KEY)');
    this.name = 'ClassifierNotConfiguredError';
  }
}

export class ClassifierUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ClassifierUnavailableError';
  }
}

// Problems with the photo itself, reported to the client (status + message are safe to expose).
export class InvalidImageError extends Error {
  readonly status = 400;
  readonly expose = true;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

// The photo is valid but can't be turned into a closet item (not clothing, or declined by the model).
export class UnclassifiablePhotoError extends Error {
  readonly status = 422;
  readonly expose = true;
  constructor(message: string) {
    super(message);
    this.name = 'UnclassifiablePhotoError';
  }
}

const SYSTEM_PROMPT = `You catalogue clothing for a digital wardrobe app. Each request is one photo of a single item a user wants to add to their closet. It may also include a second photo showing the back of the same item.

Describe the main item in the photo:
- name: a short, natural item name a person would use, e.g. "Navy wool overcoat" or "White leather sneakers" (at most ${CLOTHING_LIMITS.nameLength} characters).
- category: the one category that fits best. Use "dress" for one-piece garments such as dresses and jumpsuits, "outerwear" for jackets, coats and blazers worn over other clothes, and "accessory" for bags, hats, belts, scarves, jewellery and similar. Otherwise, classify garments into these categories: ${Object.keys(MESHES_CATEGORIES)}.
- color: the dominant colour as a simple lowercase name, e.g. "navy" or "light grey"; use "multicolor" when no single colour dominates.
- style: one or two lowercase words for how the item is typically worn, e.g. "casual", "formal", "business", "sporty", "streetwear", "loungewear" or "outdoor".

If a back photo is included, use it only to refine the details above (for example a back print, a hood or a different back colour). The front photo decides everything else, and if the back photo is unclear or doesn't seem to show the same item, rely on the front photo.

If the photo (the front photo, when there are two) shows several items, describe the most prominent one. If it doesn't show a clothing item or accessory at all, set isClothing to false and fill the other fields with your best guess.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    isClothing: { type: 'boolean' },
    name: { type: 'string' },
    category: { type: 'string', enum: [...CLOTHING_CATEGORIES] },
    color: { type: 'string' },
    style: { type: 'string' },
  },
  required: ['isClothing', 'name', 'category', 'color', 'style'],
  additionalProperties: false,
};

type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function isSupportedImageType(mediaType: string): mediaType is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mediaType);
}

// Rejects an unusable photo before anything is sent to Claude. `subject` names it in the message.
function checkImage(image: Uint8Array, mediaType: string, subject: 'image' | 'back image'): SupportedImageType {
  if (!isSupportedImageType(mediaType)) {
    throw new InvalidImageError(`Unsupported ${subject} type; use one of: ${SUPPORTED_IMAGE_TYPES.join(', ')}`);
  }
  if (image.byteLength === 0) {
    throw new InvalidImageError(`The ${subject} is empty`);
  }
  if (image.byteLength > MAX_IMAGE_BYTES) {
    throw new InvalidImageError(`The ${subject} must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`);
  }
  return mediaType;
}

function toImageBlock(image: Uint8Array, mediaType: SupportedImageType): Anthropic.Beta.BetaImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(image).toString('base64') } };
}

// Keeps the model's free-text fields within the closet item's limits.
function clean(value: string, maxLength: number, fallback: string): string {
  const text = value.trim().replace(/\s+/g, ' ').slice(0, maxLength).trim();
  return text.length > 0 ? text : fallback;
}

function parseClassification(response: Anthropic.Beta.BetaMessage): ClothingClassification {
  if (response.stop_reason === 'refusal') {
    throw new UnclassifiablePhotoError('This photo could not be classified');
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (response.stop_reason !== 'end_turn' || text.length === 0) {
    throw new ClassifierUnavailableError(`Unexpected classifier response (stop reason: ${response.stop_reason})`);
  }

  let output: { isClothing: boolean; name: string; category: string; color: string; style: string };
  try {
    output = JSON.parse(text) as typeof output;
  } catch (err) {
    throw new ClassifierUnavailableError('Classifier returned invalid JSON', { cause: err });
  }
  if (!output.isClothing) {
    throw new UnclassifiablePhotoError('The photo does not show a clothing item');
  }
  if (!(CLOTHING_CATEGORIES as readonly string[]).includes(output.category)) {
    throw new ClassifierUnavailableError(`Classifier returned an unknown category: ${output.category}`);
  }
  return {
    name: clean(output.name, CLOTHING_LIMITS.nameLength, 'Clothing item'),
    category: output.category as ClothingCategory,
    color: clean(output.color.toLowerCase(), CLOTHING_LIMITS.colorLength, 'unknown'),
    style: clean(output.style.toLowerCase(), CLOTHING_LIMITS.styleLength, 'casual'),
  };
}

export function createClothingClassifier(client: Anthropic): ClothingClassifier {
  return {
    async classify(image, mediaType, back) {
      const frontType = checkImage(image, mediaType, 'image');
      const backType = back === undefined ? undefined : checkImage(back.image, back.mediaType, 'back image');

      // With a back photo, both go in the same request, labelled so the model knows which is which.
      const content: Anthropic.Beta.BetaContentBlockParam[] =
        back === undefined || backType === undefined
          ? [toImageBlock(image, frontType), { type: 'text', text: 'Classify this clothing item.' }]
          : [
              { type: 'text', text: 'Front photo:' },
              toImageBlock(image, frontType),
              { type: 'text', text: 'Back photo:' },
              toImageBlock(back.image, backType),
              { type: 'text', text: 'Classify this clothing item.' },
            ];

      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: CLASSIFIER_MODEL,
          max_tokens: 2048,
          // Retries a declined request on another model inside the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        });
      } catch (err) {
        if (err instanceof Anthropic.BadRequestError) {
          throw new InvalidImageError('The image could not be read');
        }
        // Rate limits, timeouts, outages and authentication problems: the photo itself is fine.
        throw new ClassifierUnavailableError('Photo classification is unavailable right now', { cause: err });
      }
      return parseClassification(response);
    },
  };
}

let defaultClassifier: ClothingClassifier | undefined;

export function isClassifierConfigured(): boolean {
  return defaultClassifier !== undefined || env.anthropicApiKey !== undefined;
}

// Replaces the app-wide classifier (e.g. with a stand-in in tests); undefined goes back to the env-configured one.
export function setClothingClassifier(classifier: ClothingClassifier | undefined): void {
  defaultClassifier = classifier;
}

// The app-wide classifier, configured from ANTHROPIC_API_KEY.
// Throws ClassifierNotConfiguredError (reported to the client as 503) if it isn't set up.
export function getClothingClassifier(): ClothingClassifier {
  if (defaultClassifier === undefined) {
    if (env.anthropicApiKey === undefined) {
      throw new ClassifierNotConfiguredError();
    }
    defaultClassifier = createClothingClassifier(
      new Anthropic({ apiKey: env.anthropicApiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 })
    );
  }
  return defaultClassifier;
}
