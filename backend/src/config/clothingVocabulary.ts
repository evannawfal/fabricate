import type { OutfitOccasion } from '../models/outfit.js';

// The closet gap analysis reasons in these colours. Neutrals go with anything; other colours go
// with neutrals and their own family.
export const COLORS = {
  black: 'neutral',
  white: 'neutral',
  grey: 'neutral',
  navy: 'neutral',
  beige: 'neutral',
  brown: 'neutral',
  olive: 'neutral',
  denim: 'neutral',
  red: 'warm',
  burgundy: 'warm',
  pink: 'warm',
  orange: 'warm',
  yellow: 'warm',
  blue: 'cool',
  green: 'cool',
  purple: 'cool',
} as const;
export type Color = keyof typeof COLORS;

// The classifier names colours freely ("light grey", "navy blue", "forest green"), so each colour
// is also matched by these words. Words like "light" and "dark" aren't listed and are skipped.
export const COLOR_SYNONYMS: Record<Color, readonly string[]> = {
  black: ['jet', 'onyx', 'ebony'],
  white: ['ivory', 'ecru', 'bone', 'snow', 'pearl', 'offwhite'],
  grey: ['gray', 'charcoal', 'heather', 'slate', 'ash', 'graphite', 'silver', 'pewter', 'smoke', 'gunmetal'],
  navy: ['midnight', 'indigo'],
  beige: ['cream', 'tan', 'khaki', 'camel', 'sand', 'stone', 'taupe', 'nude', 'oatmeal', 'champagne', 'fawn'],
  brown: ['chocolate', 'coffee', 'mocha', 'espresso', 'chestnut', 'cognac', 'walnut', 'tobacco'],
  olive: ['army', 'moss'],
  denim: ['chambray'],
  red: ['scarlet', 'crimson', 'cherry', 'brick', 'ruby', 'tomato'],
  burgundy: ['maroon', 'wine', 'oxblood', 'merlot', 'claret', 'bordeaux'],
  pink: ['rose', 'blush', 'fuchsia', 'magenta', 'salmon', 'raspberry'],
  orange: ['rust', 'peach', 'apricot', 'terracotta', 'copper', 'tangerine', 'coral'],
  yellow: ['mustard', 'gold', 'golden', 'lemon', 'butter', 'ochre'],
  blue: ['cobalt', 'sky', 'azure', 'teal', 'turquoise', 'aqua', 'cyan', 'sapphire', 'cerulean', 'periwinkle'],
  green: ['emerald', 'mint', 'sage', 'lime', 'jade', 'kelly', 'forest', 'seafoam', 'pistachio'],
  purple: ['lavender', 'lilac', 'violet', 'plum', 'mauve', 'eggplant', 'aubergine', 'grape', 'amethyst'],
};

// Several colours or a print, e.g. "multicolor" or "blue striped". These only go with neutrals, and
// win over any colour named alongside them.
export const PATTERN_WORDS: readonly string[] = [
  'multicolor', 'multicolour', 'multicolored', 'multicoloured', 'multi', 'plaid', 'tartan', 'check', 'checked',
  'checkered', 'gingham', 'houndstooth', 'striped', 'stripe', 'stripes', 'floral', 'print', 'printed', 'pattern',
  'patterned', 'camo', 'camouflage', 'paisley', 'leopard', 'zebra', 'animal', 'rainbow', 'colorblock', 'colourblock', 'dye',
];

export const STYLES = ['casual', 'business', 'formal', 'sporty', 'streetwear', 'loungewear', 'outdoor'] as const;
export type Style = (typeof STYLES)[number];

// The classifier's styles are free text too. Anything unrecognised counts as casual, the
// classifier's own default.
export const STYLE_SYNONYMS: Record<Style, readonly string[]> = {
  casual: ['everyday', 'relaxed', 'vintage', 'retro', 'boho', 'bohemian', 'preppy', 'classic', 'minimalist', 'beach'],
  business: ['smart', 'work', 'office', 'professional', 'corporate'],
  formal: ['dressy', 'elegant', 'evening', 'cocktail'],
  sporty: [
    'sport', 'sports', 'athletic', 'athleisure', 'active', 'activewear', 'gym', 'workout', 'running', 'training', 'yoga',
  ],
  streetwear: ['street', 'urban', 'skate', 'skater'],
  loungewear: ['lounge', 'sleepwear', 'comfy', 'cozy', 'pajama', 'pyjama'],
  outdoor: ['hiking', 'trail', 'rain', 'technical', 'utility', 'camping'],
};

export const STYLE_PAIRINGS: Record<Style, readonly Style[]> = {
  casual: ['casual', 'business', 'sporty', 'streetwear', 'loungewear', 'outdoor'],
  business: ['business', 'formal', 'casual'],
  formal: ['formal', 'business'],
  sporty: ['sporty', 'casual', 'streetwear', 'outdoor'],
  streetwear: ['streetwear', 'casual', 'sporty'],
  loungewear: ['loungewear', 'casual'],
  outdoor: ['outdoor', 'casual', 'sporty'],
};

// Owning one of these counts as owning the other, so a grey formal blazer isn't followed by a grey business one.
export const INTERCHANGEABLE_STYLES: readonly Style[] = ['business', 'formal'];

// The styles each outfit occasion can be dressed in, listed with the one to shop for first.
export const OCCASION_STYLES: Record<OutfitOccasion, readonly Style[]> = {
  casual: ['casual', 'streetwear', 'sporty', 'outdoor', 'business', 'loungewear'],
  work: ['business', 'formal'],
  workout: ['sporty'],
  formal: ['formal'],
};

const ACCENT_COLORS: readonly Color[] = ['blue', 'green', 'burgundy', 'red', 'pink', 'yellow', 'orange', 'purple'];

// Colours to suggest for each category, most versatile first; a tie in pairings goes to the earlier one.
// Denim isn't suggested, since it's a fabric rather than a colour to shop by.
export const SUGGESTED_COLORS: Record<'top' | 'bottom' | 'shoes' | 'outerwear', readonly Color[]> = {
  top: ['white', 'black', 'navy', 'grey', 'beige', 'olive', 'brown', ...ACCENT_COLORS],
  bottom: ['black', 'navy', 'beige', 'grey', 'olive', 'brown', 'white', ...ACCENT_COLORS],
  shoes: ['white', 'black', 'brown', 'grey', 'navy', 'beige', 'olive', ...ACCENT_COLORS],
  outerwear: ['black', 'navy', 'grey', 'beige', 'olive', 'brown', 'white', ...ACCENT_COLORS],
};
