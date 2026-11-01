export const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
// Outfit generation waits for the weather, so give up quickly rather than keep the user waiting.
export const WEATHER_REQUEST_TIMEOUT_MS = 5_000;

export const OUTFIT_MODEL = 'claude-sonnet-5-5';
// Generation takes a few seconds, so a request still running after this is treated as unavailable.
export const OUTFIT_REQUEST_TIMEOUT_MS = 30_000;
export const OUTFIT_MAX_RETRIES = 2;
// Far more than an outfit's name and item ids need, so the reply is never cut off.
export const OUTFIT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_OUTFIT_NAME = 'Daily outfit';

// Allowed range of each avatar measurement, in metres.
export const HEIGHT_RANGE = { min: 1.0, max: 3.0 };
export const SHOULDER_WIDTH_RANGE = { min: 0.25, max: 0.6 };
export const CHEST_WIDTH_RANGE = { min: 0.1, max: 1.0 };
export const WAIST_WIDTH_RANGE = { min: 0.1, max: 2.0 };
export const HIP_WIDTH_RANGE = { min: 0.1, max: 1.5 };

// A closet this small is too thin for shares to mean much, so only empty categories count as gaps.
export const MIN_ITEMS_FOR_CLOSET_SHARES = 10;
export const MIN_CATEGORY_SHARES = { top: 0.2, bottom: 0.2, shoes: 0.15, outerwear: 0.05 } as const;
export const MIN_VERSATILE_PAIRINGS = 2;
export const MAX_PAIRED_ITEMS = 6;
export const COLOR_FAMILIES = {
  neutral: ['black', 'white', 'grey', 'gray', 'beige', 'cream', 'tan', 'khaki', 'brown', 'navy', 'denim', 'charcoal', 'ivory', 'camel'],
  warm: ['red', 'orange', 'yellow', 'pink', 'coral', 'burgundy', 'maroon', 'gold', 'mustard', 'rust'],
  cool: ['blue', 'green', 'purple', 'teal', 'turquoise', 'olive', 'mint', 'lavender', 'silver'],
} as const;
export const STYLE_PAIRINGS = {
  casual: ['casual', 'streetwear', 'sporty', 'outdoor', 'loungewear'],
  formal: ['formal', 'business'],
  business: ['business', 'formal', 'casual'],
  sporty: ['sporty', 'casual', 'streetwear', 'outdoor'],
  streetwear: ['streetwear', 'casual', 'sporty'],
  loungewear: ['loungewear', 'casual'],
  outdoor: ['outdoor', 'casual', 'sporty'],
} as const;
