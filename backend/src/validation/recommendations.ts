import { CATALOG_DEPARTMENT_WORDS } from '../config/constants.js';
import type { CatalogDepartment } from '../services/catalog.js';
import { invalid, valid, type ValidationResult } from './common.js';

export interface RecommendationQuery {
  country?: string;
  department?: CatalogDepartment;
}

const COUNTRY_CODE_PATTERN = /^[a-z]{2}$/i;
const DEPARTMENTS = Object.keys(CATALOG_DEPARTMENT_WORDS) as CatalogDepartment[];

function isDepartment(value: unknown): value is CatalogDepartment {
  return DEPARTMENTS.some((department) => department === value);
}

export function validateRecommendationQuery(query: Record<string, unknown>): ValidationResult<RecommendationQuery> {
  const result: RecommendationQuery = {};
  if (query.country !== undefined) {
    if (typeof query.country !== 'string' || !COUNTRY_CODE_PATTERN.test(query.country)) {
      return invalid('country must be a two-letter country code');
    }
    result.country = query.country.toLowerCase();
  }
  if (query.department !== undefined) {
    if (!isDepartment(query.department)) {
      return invalid(`department must be one of: ${DEPARTMENTS.join(', ')}`);
    }
    result.department = query.department;
  }
  return valid(result);
}
