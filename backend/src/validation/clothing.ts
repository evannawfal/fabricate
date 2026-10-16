import { CLOTHING_CATEGORIES, CLOTHING_LIMITS, type ClothingCategory } from '../models/clothingItem.js';
import { checkBodyFields, invalid, parseText, valid, type ValidationResult } from './common.js';

export interface ClothingItemUpdate {
  name?: string;
  category?: ClothingCategory;
  color?: string;
  style?: string;
  tags?: string[];
  isClean?: boolean;
}

export interface ClothingItemFilter {
  category?: ClothingCategory;
  isClean?: boolean;
}

const UPDATABLE_FIELDS = ['name', 'category', 'color', 'style', 'tags', 'isClean'] as const;

export function isClothingCategory(value: unknown): value is ClothingCategory {
  return typeof value === 'string' && (CLOTHING_CATEGORIES as readonly string[]).includes(value);
}

function parseCategory(value: unknown): ValidationResult<ClothingCategory> {
  if (!isClothingCategory(value)) {
    return invalid(`category must be one of: ${CLOTHING_CATEGORIES.join(', ')}`);
  }
  return valid(value);
}

function parseTags(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return invalid('tags must be an array of strings');
  }
  if (value.length > CLOTHING_LIMITS.maxTags) {
    return invalid(`tags must contain at most ${CLOTHING_LIMITS.maxTags} entries`);
  }
  const tags: string[] = [];
  for (const entry of value) {
    const tag = parseText(entry, 'each tag', CLOTHING_LIMITS.tagLength);
    if (!tag.ok) {
      return invalid(tag.error);
    }
    if (!tags.includes(tag.value)) {
      tags.push(tag.value);
    }
  }
  return valid(tags);
}

function parseBoolean(value: unknown, field: string): ValidationResult<boolean> {
  if (typeof value !== 'boolean') {
    return invalid(`${field} must be true or false`);
  }
  return valid(value);
}

export function validateClothingItemUpdate(body: unknown): ValidationResult<ClothingItemUpdate> {
  const fields = checkBodyFields(body, UPDATABLE_FIELDS);
  if (!fields.ok) {
    return invalid(fields.error);
  }
  const input = fields.value;
  if (Object.keys(input).length === 0) {
    return invalid(`Provide at least one of: ${UPDATABLE_FIELDS.join(', ')}`);
  }

  const update: ClothingItemUpdate = {};
  if ('name' in input) {
    const name = parseText(input.name, 'name', CLOTHING_LIMITS.nameLength);
    if (!name.ok) return invalid(name.error);
    update.name = name.value;
  }
  if ('category' in input) {
    const category = parseCategory(input.category);
    if (!category.ok) return invalid(category.error);
    update.category = category.value;
  }
  if ('color' in input) {
    const color = parseText(input.color, 'color', CLOTHING_LIMITS.colorLength);
    if (!color.ok) return invalid(color.error);
    update.color = color.value;
  }
  if ('style' in input) {
    const style = parseText(input.style, 'style', CLOTHING_LIMITS.styleLength);
    if (!style.ok) return invalid(style.error);
    update.style = style.value;
  }
  if ('tags' in input) {
    const tags = parseTags(input.tags);
    if (!tags.ok) return invalid(tags.error);
    update.tags = tags.value;
  }
  if ('isClean' in input) {
    const isClean = parseBoolean(input.isClean, 'isClean');
    if (!isClean.ok) return invalid(isClean.error);
    update.isClean = isClean.value;
  }
  return valid(update);
}

// Query string filters for listing the closet, e.g. ?category=top&clean=true
export function validateClothingItemFilter(query: Record<string, unknown>): ValidationResult<ClothingItemFilter> {
  const filter: ClothingItemFilter = {};
  if (query.category !== undefined) {
    const category = parseCategory(query.category);
    if (!category.ok) return invalid(category.error);
    filter.category = category.value;
  }
  if (query.clean !== undefined) {
    if (query.clean !== 'true' && query.clean !== 'false') {
      return invalid('clean must be true or false');
    }
    filter.isClean = query.clean === 'true';
  }
  return valid(filter);
}
