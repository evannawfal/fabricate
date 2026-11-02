import {
  COLOR_FAMILIES,
  MAX_PAIRED_ITEMS,
  MIN_CATEGORY_SHARES,
  MIN_ITEMS_FOR_CLOSET_SHARES,
  MIN_VERSATILE_PAIRINGS,
  STYLE_PAIRINGS,
} from '../config/constants.js';

type CoreCategory = keyof typeof MIN_CATEGORY_SHARES;
type ColorFamily = keyof typeof COLOR_FAMILIES;
type Style = keyof typeof STYLE_PAIRINGS;

export interface GapAnalysisItem {
  id: string;
  category: string;
  color: string;
  style: string;
}

export interface ClosetGap {
  category: CoreCategory;
  colorFamily?: ColorFamily;
  style?: Style;
  reason: string;
  pairsWith: string[];
}

interface ClassifiedItem {
  id: string;
  category: string;
  colorFamily: ColorFamily | undefined;
  style: Style | undefined;
}

interface Look {
  category: CoreCategory;
  colorFamily: ColorFamily;
  style: Style;
}

interface MatchedLook {
  look: Look;
  matches: ClassifiedItem[];
}

const CORE_CATEGORIES = Object.keys(MIN_CATEGORY_SHARES) as CoreCategory[];
const COLOR_FAMILY_NAMES = Object.keys(COLOR_FAMILIES) as ColorFamily[];
const STYLES = Object.keys(STYLE_PAIRINGS) as Style[];

const CATEGORY_WORDS: Record<CoreCategory, { none: string; one: string; few: string }> = {
  top: { none: 'tops', one: 'top', few: 'tops' },
  bottom: { none: 'bottoms', one: 'bottom', few: 'bottoms' },
  shoes: { none: 'shoes', one: 'pair of shoes', few: 'pairs of shoes' },
  outerwear: { none: 'outerwear', one: 'piece of outerwear', few: 'pieces of outerwear' },
};

const COLOR_FAMILY_BY_WORD = new Map<string, ColorFamily>(
  COLOR_FAMILY_NAMES.flatMap((family) => COLOR_FAMILIES[family].map((color): [string, ColorFamily] => [color, family]))
);
const STYLE_BY_WORD = new Map<string, Style>(STYLES.map((style) => [style, style]));

// Colours and styles are free text, e.g. "light grey", so the first word we recognise decides.
function firstKnownWord<T>(text: string, known: Map<string, T>): T | undefined {
  for (const word of text.toLowerCase().split(/[\s-]+/)) {
    const value = known.get(word);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function classify({ id, category, color, style }: GapAnalysisItem): ClassifiedItem {
  return {
    id,
    category,
    colorFamily: firstKnownWord(color, COLOR_FAMILY_BY_WORD),
    style: firstKnownWord(style, STYLE_BY_WORD),
  };
}

function goesWith(look: Look, item: ClassifiedItem): boolean {
  const replacedByDress = look.category === 'top' || look.category === 'bottom';
  if (item.category === look.category || (item.category === 'dress' && replacedByDress)) {
    return false;
  }
  if (item.colorFamily === undefined || item.style === undefined) {
    return false;
  }
  const colorsMatch =
    look.colorFamily === 'neutral' || item.colorFamily === 'neutral' || look.colorFamily === item.colorFamily;
  return colorsMatch && (STYLE_PAIRINGS[look.style] as readonly Style[]).includes(item.style);
}

function looksFor(category: CoreCategory): Look[] {
  return COLOR_FAMILY_NAMES.flatMap((colorFamily) => STYLES.map((style) => ({ category, colorFamily, style })));
}

function bestLook(looks: Look[], closet: ClassifiedItem[]): MatchedLook | undefined {
  let best: MatchedLook | undefined;
  for (const look of looks) {
    const matches = closet.filter((item) => goesWith(look, item));
    // Strictly more, so ties always go to the same look.
    if (matches.length > (best?.matches.length ?? 0)) {
      best = { look, matches };
    }
  }
  return best;
}

// Takes from each category in turn, or the cap would fill up with whichever category comes first.
function pickPairings(matches: ClassifiedItem[]): string[] {
  const seenPerCategory = new Map<string, number>();
  const ranked = matches.map(({ id, category }) => {
    const rank = seenPerCategory.get(category) ?? 0;
    seenPerCategory.set(category, rank + 1);
    return { id, rank };
  });
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_PAIRED_ITEMS)
    .map(({ id }) => id);
}

function toGap(category: CoreCategory, reason: string, match: MatchedLook | undefined): ClosetGap {
  if (match === undefined) {
    return { category, reason, pairsWith: [] };
  }
  const { colorFamily, style } = match.look;
  return { category, colorFamily, style, reason, pairsWith: pickPairings(match.matches) };
}

function countFor(category: CoreCategory, closet: ClassifiedItem[]): number {
  // A dress does the job of a top and a bottom, so dress-wearers aren't told they lack either.
  const fillsCategory = (item: ClassifiedItem) =>
    item.category === category || (item.category === 'dress' && (category === 'top' || category === 'bottom'));
  return closet.filter(fillsCategory).length;
}

function findVersatileGap(closet: ClassifiedItem[]): ClosetGap | undefined {
  const isOwned = (look: Look) =>
    closet.some(
      (item) =>
        item.category === look.category && item.colorFamily === look.colorFamily && item.style === look.style
    );
  const best = bestLook(CORE_CATEGORIES.flatMap(looksFor).filter((look) => !isOwned(look)), closet);
  if (best === undefined || best.matches.length < MIN_VERSATILE_PAIRINGS) {
    return undefined;
  }
  const { category, colorFamily, style } = best.look;
  const piece = `${colorFamily} ${style} ${CATEGORY_WORDS[category].one}`;
  return toGap(category, `A ${piece} would go with ${best.matches.length} of your items`, best);
}

/** Empty categories, then thin ones. Only a closet with neither gets a versatile suggestion, so it's never padding. */
export function analyzeClosetGaps(items: GapAnalysisItem[]): ClosetGap[] {
  const closet = items.map(classify);
  // Accessories don't make an outfit, so a big collection shouldn't make everything else look thin.
  const wearable = closet.filter((item) => item.category !== 'accessory').length;
  const missing: ClosetGap[] = [];
  const underrepresented: ClosetGap[] = [];

  for (const category of CORE_CATEGORIES) {
    const count = countFor(category, closet);
    const best = bestLook(looksFor(category), closet);
    if (count === 0) {
      missing.push(toGap(category, `No ${CATEGORY_WORDS[category].none} in your closet`, best));
    } else if (wearable >= MIN_ITEMS_FOR_CLOSET_SHARES && count / wearable < MIN_CATEGORY_SHARES[category]) {
      underrepresented.push(toGap(category, `Not many ${CATEGORY_WORDS[category].few} compared to the rest of your closet`, best));
    }
  }

  const gaps = [...missing, ...underrepresented];
  if (gaps.length > 0) {
    return gaps;
  }
  const versatile = findVersatileGap(closet);
  return versatile === undefined ? [] : [versatile];
}
