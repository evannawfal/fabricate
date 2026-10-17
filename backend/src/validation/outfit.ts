import { OUTFIT_LIMITS } from '../models/outfit.js';
import { checkBodyFields, invalid, parseIdList, parseText, valid, type ValidationResult } from './common.js';

export interface OutfitInput {
  name: string;
  occasion: string;
  items: string[];
}

export type OutfitUpdate = Partial<OutfitInput>;

const OUTFIT_FIELDS = ['name', 'occasion', 'items'] as const;

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
