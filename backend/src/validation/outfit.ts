import { OUTFIT_LIMITS, OUTFIT_OCCASIONS, type OutfitOccasion } from '../models/outfit.js';
import { checkBodyFields, invalid, parseIdList, parseText, valid, type ValidationResult } from './common.js';

export interface OutfitInput {
  name: string;
  occasion: string;
  items: string[];
}

export type OutfitUpdate = Partial<OutfitInput>;

/** The body of POST /outfits/generate. */
export interface GenerateOutfitInput {
  occasion: OutfitOccasion;
  latitude: number;
  longitude: number;
}

const OUTFIT_FIELDS = ['name', 'occasion', 'items'] as const;
const GENERATE_FIELDS = ['occasion', 'latitude', 'longitude'] as const;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

function parseName(value: unknown): ValidationResult<string> {
  return parseText(value, 'name', OUTFIT_LIMITS.nameLength);
}

function parseOccasion(value: unknown): ValidationResult<string> {
  return parseText(value, 'occasion', OUTFIT_LIMITS.occasionLength, { allowEmpty: true });
}

function parseItems(value: unknown): ValidationResult<string[]> {
  return parseIdList(value, 'items', OUTFIT_LIMITS.maxItems);
}

export function validateOutfitInput(body: unknown): ValidationResult<OutfitInput> {
  const fields = checkBodyFields(body, OUTFIT_FIELDS);
  if (!fields.ok) {
    return invalid(fields.error);
  }
  const input = fields.value;

  const name = parseName(input.name);
  if (!name.ok) return invalid(name.error);
  const occasion = input.occasion === undefined ? valid('') : parseOccasion(input.occasion);
  if (!occasion.ok) return invalid(occasion.error);
  const items = parseItems(input.items);
  if (!items.ok) return invalid(items.error);

  return valid({ name: name.value, occasion: occasion.value, items: items.value });
}

export function validateOutfitUpdate(body: unknown): ValidationResult<OutfitUpdate> {
  const fields = checkBodyFields(body, OUTFIT_FIELDS);
  if (!fields.ok) {
    return invalid(fields.error);
  }
  const input = fields.value;
  if (Object.keys(input).length === 0) {
    return invalid(`Provide at least one of: ${OUTFIT_FIELDS.join(', ')}`);
  }

  const update: OutfitUpdate = {};
  if ('name' in input) {
    const name = parseName(input.name);
    if (!name.ok) return invalid(name.error);
    update.name = name.value;
  }
  if ('occasion' in input) {
    const occasion = parseOccasion(input.occasion);
    if (!occasion.ok) return invalid(occasion.error);
    update.occasion = occasion.value;
  }
  if ('items' in input) {
    const items = parseItems(input.items);
    if (!items.ok) return invalid(items.error);
    update.items = items.value;
  }
  return valid(update);
}

function isOccasion(value: unknown): value is OutfitOccasion {
  return (OUTFIT_OCCASIONS as readonly unknown[]).includes(value);
}

/**
 * Checks that a coordinate is a number between -limit and limit.
 * @returns the coordinate, or an error naming the field
 */
function parseCoordinate(value: unknown, field: string, limit: number): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    return invalid(`${field} must be a number between -${limit} and ${limit}`);
  }
  return valid(value);
}

/**
 * Validates the body of POST /outfits/generate.
 * @returns the input, or an error describing the first problem found
 */
export function validateGenerateOutfitInput(body: unknown): ValidationResult<GenerateOutfitInput> {
  const fields = checkBodyFields(body, GENERATE_FIELDS);
  if (!fields.ok) {
    return invalid(fields.error);
  }
  const input = fields.value;

  if (!isOccasion(input.occasion)) {
    return invalid(`occasion must be one of: ${OUTFIT_OCCASIONS.join(', ')}`);
  }
  const latitude = parseCoordinate(input.latitude, 'latitude', MAX_LATITUDE);
  if (!latitude.ok) return invalid(latitude.error);
  const longitude = parseCoordinate(input.longitude, 'longitude', MAX_LONGITUDE);
  if (!longitude.ok) return invalid(longitude.error);

  return valid({ occasion: input.occasion, latitude: latitude.value, longitude: longitude.value });
}
