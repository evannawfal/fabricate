import { checkBodyFields, invalid, valid, type ValidationResult } from './common.js';
import { AvatarInput } from '../avatar/types.js';
  
const RANGES: number[][] = [
  [1.0, 3.0],
  [0.25, 0.60],
  [0.10, 1.00],
  [0.10, 2.00],
  [0.10, 1.50],
];
const AVATAR_FIELDS = ['height', 'shoulderWidth', 'chestWidth', 'waistWidth', 'hipWidth'] as const;
const invalidMeasurementError = (name: string, min: number, max: number) =>
  `Measurement Invalid: ${name} should be within ${min}m and ${max}m`;

export function validateAvatarInput(body: unknown): ValidationResult<AvatarInput> {
  const fields = checkBodyFields(body, AVATAR_FIELDS);
  if (!fields.ok) {
    return invalid(fields.error);
  }
  const input = fields.value as Record<string, unknown>;

  const values: Record<string, number> = {};

  for (let i = 0; i < AVATAR_FIELDS.length; i++) {
    const field = AVATAR_FIELDS[i]!;
    const [min, max] = RANGES[i]!;
    const val = input[field];

    if (typeof val !== "number" || !Number.isFinite(val) || val < min! || val > max!) {
      return invalid(invalidMeasurementError(field, min!, max!));
    }
    values[field] = val;
  }

  return valid(values as unknown as AvatarInput);
}