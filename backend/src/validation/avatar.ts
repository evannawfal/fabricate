import { checkBodyFields, invalid, valid, type ValidationResult } from './common.js';
import { AvatarInput } from '../avatar/types.js';
import {
  CHEST_WIDTH_RANGE,
  HEIGHT_RANGE,
  HIP_WIDTH_RANGE,
  SHOULDER_WIDTH_RANGE,
  WAIST_WIDTH_RANGE,
} from '../config/constants.js';

interface MeasurementRange {
  min: number;
  max: number;
}

const AVATAR_FIELDS = ['height', 'shoulderWidth', 'chestWidth', 'waistWidth', 'hipWidth'] as const;

function parseMeasurement(value: unknown, field: string, { min, max }: MeasurementRange): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return invalid(`Measurement Invalid: ${field} should be within ${min}m and ${max}m`);
  }
  return valid(value);
}

export function validateAvatarInput(body: unknown): ValidationResult<AvatarInput> {
  const fields = checkBodyFields(body, AVATAR_FIELDS);
  if (!fields.ok) {
    return invalid(fields.error);
  }
  const input = fields.value;

  const height = parseMeasurement(input.height, 'height', HEIGHT_RANGE);
  if (!height.ok) return invalid(height.error);
  const shoulderWidth = parseMeasurement(input.shoulderWidth, 'shoulderWidth', SHOULDER_WIDTH_RANGE);
  if (!shoulderWidth.ok) return invalid(shoulderWidth.error);
  const chestWidth = parseMeasurement(input.chestWidth, 'chestWidth', CHEST_WIDTH_RANGE);
  if (!chestWidth.ok) return invalid(chestWidth.error);
  const waistWidth = parseMeasurement(input.waistWidth, 'waistWidth', WAIST_WIDTH_RANGE);
  if (!waistWidth.ok) return invalid(waistWidth.error);
  const hipWidth = parseMeasurement(input.hipWidth, 'hipWidth', HIP_WIDTH_RANGE);
  if (!hipWidth.ok) return invalid(hipWidth.error);

  return valid({
    height: height.value,
    shoulderWidth: shoulderWidth.value,
    chestWidth: chestWidth.value,
    waistWidth: waistWidth.value,
    hipWidth: hipWidth.value,
  });
}
