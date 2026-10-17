export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function invalid<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Request bodies must be a non-empty object containing only known fields.
export function checkBodyFields(body: unknown, allowedFields: readonly string[]): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object');
  }
  const unknownField = Object.keys(body).find((key) => !allowedFields.includes(key));
  if (unknownField !== undefined) {
    return invalid(`Unknown field: ${unknownField}`);
  }
  return valid(body);
}

export function parseText(
  value: unknown,
  field: string,
  maxLength: number,
  options: { allowEmpty?: boolean } = {}
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return invalid(`${field} must be a string`);
  }
  const text = value.trim();
  if (text.length === 0 && options.allowEmpty !== true) {
    return invalid(`${field} must not be empty`);
  }
  if (text.length > maxLength) {
    return invalid(`${field} must be at most ${maxLength} characters`);
  }
  return valid(text);
}

export function parseIdList(value: unknown, field: string, maxCount: number): ValidationResult<string[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return invalid(`${field} must be a non-empty array`);
  }
  if (value.length > maxCount) {
    return invalid(`${field} must contain at most ${maxCount} entries`);
  }
  if (!value.every(isObjectId)) {
    return invalid(`${field} must only contain valid ids`);
  }
  const ids = value.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    return invalid(`${field} must not contain duplicates`);
  }
  return valid(ids);
}
