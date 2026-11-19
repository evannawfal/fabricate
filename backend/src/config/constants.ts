export const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
// Outfit generation waits for the weather, so give up quickly rather than keep the user waiting.
export const WEATHER_REQUEST_TIMEOUT_MS = 5_000;
export const SERPER_SHOPPING_URL = 'https://google.serper.dev/shopping';
export const CATALOG_REQUEST_TIMEOUT_MS = 8_000;
export const CATALOG_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_CATALOG_COUNTRY = 'ca';
export const MAX_CATALOG_ITEMS = 8;
export const MAX_CATALOG_ITEMS_PER_STORE = 2;
export const CATALOG_CATEGORY_WORDS = { top: 'shirt', bottom: 'pants', shoes: 'shoes', outerwear: 'jacket' } as const;
export const CATALOG_STYLE_WORDS = {
  casual: 'casual',
  business: 'business',
  formal: 'formal',
  sporty: 'athletic',
  streetwear: 'streetwear',
  loungewear: 'lounge',
  outdoor: 'outdoor',
} as const;
// Searches with neither word come back mostly women's.
export const CATALOG_DEPARTMENT_WORDS = { mens: "men's", womens: "women's" } as const;

export const OUTFIT_MODEL = 'claude-sonnet-5-5';
// Generation takes a few seconds, so a request still running after this is treated as unavailable.
export const OUTFIT_REQUEST_TIMEOUT_MS = 30_000;
export const OUTFIT_MAX_RETRIES = 2;
// Far more than an outfit's name and item ids need, so the reply is never cut off.
export const OUTFIT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_OUTFIT_NAME = 'Daily outfit';

// Room update latency NFR (Requirements_and_Design.md section 3.7), checked by tests/nfr/.
export const ROOM_UPDATE_LATENCY_LIMIT_MS = 1_000;
export const ROOM_UPDATES_ON_TIME_SHARE = 0.95;

// Allowed range of each avatar measurement, in metres.
export const HEIGHT_RANGE = { min: 1.0, max: 3.0 };
export const SHOULDER_WIDTH_RANGE = { min: 0.25, max: 0.6 };
export const CHEST_WIDTH_RANGE = { min: 0.1, max: 1.0 };
export const WAIST_WIDTH_RANGE = { min: 0.1, max: 2.0 };
export const HIP_WIDTH_RANGE = { min: 0.1, max: 1.5 };

// Outfit generation and recommendations both need at least one of each to work with.
export const REQUIRED_CLOSET_CATEGORIES = ['top', 'bottom'] as const;

export const MAX_CLOSET_GAPS = 3;
export const MAX_STORE_ITEMS_PER_GAP = 4;
// Below this many tops and bottoms together, their balance says little about what's missing.
export const MIN_TOPS_AND_BOTTOMS_FOR_BALANCE = 8;
// People usually own more tops than bottoms, so tops are only short once they're outnumbered,
// and bottoms once each has to go with more than this many tops.
export const MAX_TOPS_PER_BOTTOM = 4;
// A suggestion that only adds an outfit or two isn't worth a store search.
export const MIN_NEW_OUTFITS = 3;
// Beyond this, the exact number of new outfits means little, so reasons say "100+".
export const MAX_OUTFITS_IN_REASON = 100;
// A closet of at least this many clothes with at most this share in colours or patterns is mostly
// neutrals, so a coloured piece is suggested.
export const MIN_ITEMS_FOR_ACCENT = 8;
export const MAX_ACCENT_SHARE = 0.1;
export const MAX_PAIRED_ITEMS = 6;

// Closet analysis time NFR (Requirements_and_Design.md section 3.7), checked by tests/nfr/.
export const CLOSET_ANALYSIS_TIME_LIMIT_MS = 2_000;
export const CLOSET_ANALYSIS_MAX_ITEMS = 500;

export const MESHES_CATEGORIES : Record<string, string> = {
    "t-shirt": "t_shirt.glb",
    "shirt": "shirt.glb",
    "hoodie": "hoodie.glb",
    "pants": "pants.glb",
    "skirt": "skirt.glb",
    "shorts": "shorts.glb",
  };