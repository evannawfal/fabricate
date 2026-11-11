import { checkBodyFields, invalid, isObjectId, valid, type ValidationResult } from './common.js';

export interface PostInput {
  outfitId: string;
}

export function validatePostInput(body: unknown): ValidationResult<PostInput> {
  const fields = checkBodyFields(body, ['outfitId']);
  if (!fields.ok) return invalid(fields.error);
  const { outfitId } = fields.value;
  if (!isObjectId(outfitId)) return invalid('outfitId must be a valid id');
  return valid({ outfitId });
}
