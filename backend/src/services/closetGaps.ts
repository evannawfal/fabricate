import {
  CATALOG_STYLE_WORDS,
  MAX_ACCENT_SHARE,
  MAX_CLOSET_GAPS,
  MAX_OUTFITS_IN_REASON,
  MAX_PAIRED_ITEMS,
  MAX_TOPS_PER_BOTTOM,
  MIN_ITEMS_FOR_ACCENT,
  MIN_NEW_OUTFITS,
  MIN_TOPS_AND_BOTTOMS_FOR_BALANCE,
} from '../config/constants.js';
import {
  COLORS,
  COLOR_SYNONYMS,
  INTERCHANGEABLE_STYLES,
  OCCASION_STYLES,
  PATTERN_WORDS,
  STYLES,
  STYLE_PAIRINGS,
  STYLE_SYNONYMS,
  SUGGESTED_COLORS,
  type Color,
  type Style,
} from '../config/clothingVocabulary.js';
import type { OutfitOccasion } from '../models/outfit.js';

export type GapCategory = keyof typeof SUGGESTED_COLORS;

export interface GapAnalysisItem {
  id: string;
  category: string;
  color: string;
  style: string;
}

export interface ClosetGap {
  category: GapCategory;
  color: Color;
  style: Style;
  reason: string;
  pairsWith: string[];
}

interface ClassifiedItem {
  id: string;
  category: string;
  // undefined when the colour isn't recognised, so the item can't be paired.
  color: Color | 'pattern' | undefined;
  style: Style;
}

interface Look {
  category: GapCategory;
  color: Color;
  style: Style;
}

interface MatchedLook {
  look: Look;
  matches: ClassifiedItem[];
}

interface OutfitLook {
  look: Look;
  outfits: number;
}

// For each suggested piece, the pairs of clothes a new one would be worn with.
type OutfitPartners = Record<SuggestedPiece, ClassifiedItem[][]>;

const GAP_CATEGORIES = Object.keys(SUGGESTED_COLORS) as GapCategory[];
// Only tops and bottoms are suggested for the outfits they'd make. Colour and style alone say too
// little about whether new shoes or a jacket would suit, so those are only suggested when the
// closet has none, or none for an occasion.
const SUGGESTED_PIECES = ['top', 'bottom'] as const;
type SuggestedPiece = (typeof SUGGESTED_PIECES)[number];
const OCCASIONS = Object.keys(OCCASION_STYLES) as OutfitOccasion[];

const CATEGORY_NAMES: Record<GapCategory, string> = {
  top: 'tops',
  bottom: 'bottoms',
  shoes: 'shoes',
  outerwear: 'outerwear',
};
const SUGGESTION_PHRASES: Record<SuggestedPiece, (look: string) => string> = {
  top: (look) => `A ${look} top`,
  bottom: (look) => `${capitalize(look)} pants`,
};

const OCCASION_WORDS: Record<OutfitOccasion, { event: string; adjective: string }> = {
  casual: { event: 'a casual day', adjective: 'casual' },
  work: { event: 'work', adjective: 'work' },
  workout: { event: 'a workout', adjective: 'workout' },
  formal: { event: 'a formal event', adjective: 'formal' },
};

const COLOR_BY_WORD = new Map<string, Color>(
  (Object.keys(COLORS) as Color[]).flatMap((color) =>
    [color, ...COLOR_SYNONYMS[color]].map((word): [string, Color] => [word, color])
  )
);
const STYLE_BY_WORD = new Map<string, Style>(
  STYLES.flatMap((style) => [style, ...STYLE_SYNONYMS[style]].map((word): [string, Style] => [word, style]))
);
const PATTERNS = new Set(PATTERN_WORDS);

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[\s,/&-]+/);
}

function colorOf(text: string): Color | 'pattern' | undefined {
  const words = wordsOf(text);
  if (words.some((word) => PATTERNS.has(word))) {
    return 'pattern';
  }
  return words.map((word) => COLOR_BY_WORD.get(word)).find((color) => color !== undefined);
}

function styleOf(text: string): Style {
  return wordsOf(text).map((word) => STYLE_BY_WORD.get(word)).find((style) => style !== undefined) ?? 'casual';
}

function classify({ id, category, color, style }: GapAnalysisItem): ClassifiedItem {
  return { id, category, color: colorOf(color), style: styleOf(style) };
}

function familyOf(color: Color | 'pattern'): string {
  return color === 'pattern' ? 'pattern' : COLORS[color];
}

function isAccent(item: ClassifiedItem): boolean {
  return item.color !== undefined && familyOf(item.color) !== 'neutral';
}

// Whether two pieces can be worn together, by colour and style alone.
function goTogether(a: Pick<ClassifiedItem, 'color' | 'style'>, b: Pick<ClassifiedItem, 'color' | 'style'>): boolean {
  if (a.color === undefined || b.color === undefined || !STYLE_PAIRINGS[a.style].includes(b.style)) {
    return false;
  }
  const [first, second] = [familyOf(a.color), familyOf(b.color)];
  return first === 'neutral' || second === 'neutral' || (first === second && first !== 'pattern');
}

function goesWith(look: Look, item: ClassifiedItem): boolean {
  const replacedByDress = look.category === 'top' || look.category === 'bottom';
  if (item.category === look.category || (item.category === 'dress' && replacedByDress)) {
    return false;
  }
  return goTogether(look, item);
}

function matchesFor(look: Look, closet: ClassifiedItem[]): MatchedLook {
  return { look, matches: closet.filter((item) => goesWith(look, item)) };
}

function sameStyle(a: Style, b: Style): boolean {
  return a === b || (INTERCHANGEABLE_STYLES.includes(a) && INTERCHANGEABLE_STYLES.includes(b));
}

function owns(closet: ClassifiedItem[], look: Look): boolean {
  return closet.some(
    (item) => item.category === look.category && item.color === look.color && sameStyle(item.style, look.style)
  );
}

function countIn(closet: ClassifiedItem[], category: string): number {
  return closet.filter((item) => item.category === category).length;
}

function looksFor(category: GapCategory, styles: readonly Style[]): Look[] {
  return styles.flatMap((style) => SUGGESTED_COLORS[category].map((color) => ({ category, color, style })));
}

function bestLook(looks: Look[], closet: ClassifiedItem[]): MatchedLook | undefined {
  let best: MatchedLook | undefined;
  for (const look of looks) {
    const match = matchesFor(look, closet);
    // Strictly more, so ties go to the earlier style and the more versatile colour.
    if (best === undefined || match.matches.length > best.matches.length) {
      best = match;
    }
  }
  return best;
}

function outfitPartners(closet: ClassifiedItem[]): OutfitPartners {
  const [tops, bottoms, shoes] = ['top', 'bottom', 'shoes'].map((category) =>
    closet.filter((item) => item.category === category)
  ) as [ClassifiedItem[], ClassifiedItem[], ClassifiedItem[]];
  const pairs = (first: ClassifiedItem[], second: ClassifiedItem[]) =>
    first.flatMap((a) => second.filter((b) => goTogether(a, b)).map((b) => [a, b]));
  return { top: pairs(bottoms, shoes), bottom: pairs(tops, shoes) };
}

function outfitCount(outfits: number): string {
  return outfits >= MAX_OUTFITS_IN_REASON ? `${MAX_OUTFITS_IN_REASON}+` : String(outfits);
}

function newOutfits(look: Look, partners: ClassifiedItem[][]): number {
  return partners.filter((set) => set.every((piece) => goTogether(look, piece))).length;
}

// The look that would make the most new outfits with what the closet already has.
function mostOutfits(looks: Look[], partners: ClassifiedItem[][]): OutfitLook | undefined {
  let best: OutfitLook | undefined;
  for (const look of looks) {
    const outfits = newOutfits(look, partners);
    if (best === undefined || outfits > best.outfits) {
      best = { look, outfits };
    }
  }
  return best;
}

// Ties go to the earlier style in STYLES.
function mostWornStyle(closet: ClassifiedItem[]): Style {
  const worn = (style: Style) =>
    closet.filter((item) => item.category !== 'accessory' && item.style === style).length;
  return STYLES.reduce((most, style) => (worn(style) > worn(most) ? style : most));
}

// New pieces in the style the user wears most, unless they already own it in every colour.
function candidateLooks(category: GapCategory, closet: ClassifiedItem[]): Look[] {
  const unowned = (styles: readonly Style[]) => looksFor(category, styles).filter((look) => !owns(closet, look));
  const inUsualStyle = unowned([mostWornStyle(closet)]);
  return inUsualStyle.length > 0 ? inUsualStyle : unowned(STYLES);
}

function newLookFor(category: GapCategory, closet: ClassifiedItem[]): MatchedLook | undefined {
  return bestLook(candidateLooks(category, closet), closet);
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

function toGap(reason: string, { look, matches }: MatchedLook): ClosetGap {
  return { ...look, reason, pairsWith: pickPairings(matches) };
}

// No gap when there's no look to suggest, i.e. the closet already owns every one.
function gapsFor(reason: string, match: MatchedLook | undefined): ClosetGap[] {
  return match === undefined ? [] : [toGap(reason, match)];
}

function joinWithOr(words: string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

// Accessories and dresses are never suggested for being missing: plenty of people don't wear them.
function emptyCategoryGaps(closet: ClassifiedItem[]): ClosetGap[] {
  return GAP_CATEGORIES.filter((category) => countIn(closet, category) === 0).flatMap((category) =>
    gapsFor(`No ${CATEGORY_NAMES[category]} in your closet`, newLookFor(category, closet))
  );
}

function occasionGaps(occasion: OutfitOccasion, closet: ClassifiedItem[]): ClosetGap[] {
  const styles = OCCASION_STYLES[occasion];
  const hasFor = (category: string) =>
    closet.some((item) => item.category === category && styles.includes(item.style));
  // An empty category is already its own gap, so it isn't repeated for every occasion.
  const lacks = (category: GapCategory) => !hasFor(category) && countIn(closet, category) > 0;
  const missingClothes = hasFor('dress') ? [] : (['top', 'bottom'] as const).filter(lacks);
  const missing: GapCategory[] = lacks('shoes') ? [...missingClothes, 'shoes'] : missingClothes;
  const [first] = missing;
  if (first === undefined) {
    return [];
  }
  const { event, adjective } = OCCASION_WORDS[occasion];
  const pieces = joinWithOr(missing.map((category) => CATEGORY_NAMES[category]));
  const reason = `Nothing to wear for ${event}: you have no ${adjective} ${pieces}`;
  return gapsFor(reason, bestLook(looksFor(first, styles.slice(0, 1)), closet));
}

function balanceGaps(closet: ClassifiedItem[]): ClosetGap[] {
  const tops = countIn(closet, 'top');
  const bottoms = countIn(closet, 'bottom');
  if (tops + bottoms < MIN_TOPS_AND_BOTTOMS_FOR_BALANCE) {
    return [];
  }
  if (tops < bottoms) {
    return gapsFor('Fewer tops than bottoms in your closet', newLookFor('top', closet));
  }
  if (tops > bottoms * MAX_TOPS_PER_BOTTOM) {
    return gapsFor(`Not many bottoms to wear with your ${tops} tops`, newLookFor('bottom', closet));
  }
  return [];
}

// A closet of almost only neutrals gets one coloured top, the one that would make the most outfits.
function accentGaps(closet: ClassifiedItem[], partners: OutfitPartners): ClosetGap[] {
  const wearable = closet.filter((item) => item.category !== 'accessory');
  if (wearable.length < MIN_ITEMS_FOR_ACCENT || wearable.filter(isAccent).length > wearable.length * MAX_ACCENT_SHARE) {
    return [];
  }
  const accents = candidateLooks('top', closet).filter((look) => COLORS[look.color] !== 'neutral');
  const best = mostOutfits(accents, partners.top);
  if (best === undefined || best.outfits < MIN_NEW_OUTFITS) {
    return [];
  }
  const top = `${best.look.color} ${CATALOG_STYLE_WORDS[best.look.style]} top`;
  const outfits = outfitCount(best.outfits);
  const reason = `Your clothes are almost all neutrals: a ${top} would add colour to ${outfits} new outfits`;
  return [toGap(reason, matchesFor(best.look, closet))];
}

// For a closet with no obvious gaps: the tops and bottoms that would make the most new outfits.
// Neutrals go with everything, so they'd always win; only one is suggested, and no colour that
// [listed] already has.
function outfitGaps(closet: ClassifiedItem[], partners: OutfitPartners, listed: ClosetGap[]): ClosetGap[] {
  const ranked = SUGGESTED_PIECES.flatMap((category) =>
    candidateLooks(category, closet).map((look) => ({ category, look, outfits: newOutfits(look, partners[category]) }))
  )
    .filter(({ outfits }) => outfits >= MIN_NEW_OUTFITS)
    .sort((a, b) => b.outfits - a.outfits);
  const usedColors = new Set(listed.map(({ color }) => color));
  const picked: typeof ranked = [];
  for (const candidate of ranked) {
    const isNeutral = COLORS[candidate.look.color] === 'neutral';
    const neutralPicked = picked.some(({ look }) => COLORS[look.color] === 'neutral');
    const repeats = usedColors.has(candidate.look.color) || (isNeutral && neutralPicked);
    if (!repeats) {
      picked.push(candidate);
      usedColors.add(candidate.look.color);
    }
  }
  return picked.map(({ category, look, outfits }) => {
    const piece = SUGGESTION_PHRASES[category](`${look.color} ${CATALOG_STYLE_WORDS[look.style]}`);
    return toGap(`${piece} would let you make ${outfitCount(outfits)} more outfits`, matchesFor(look, closet));
  });
}

/**
 * Up to MAX_CLOSET_GAPS gaps, most important first: empty categories, too few tops or bottoms,
 * occasions the closet can't dress for, a colour for an all-neutral closet, then the tops and
 * bottoms that would make the most new outfits. Balance gaps skip categories already covered and
 * other gaps skip looks already suggested, so the suggestions stay varied.
 */
export function analyzeClosetGaps(items: GapAnalysisItem[]): ClosetGap[] {
  const closet = items.map(classify);
  const gaps: ClosetGap[] = [];
  const categoryListed = (gap: ClosetGap) => gaps.some((other) => other.category === gap.category);
  const lookListed = (gap: ClosetGap) =>
    gaps.some((other) => other.category === gap.category && sameStyle(other.style, gap.style));
  const add = (candidates: ClosetGap[], isListed: (gap: ClosetGap) => boolean) => {
    for (const gap of candidates) {
      if (!isListed(gap)) {
        gaps.push(gap);
      }
    }
  };
  add(emptyCategoryGaps(closet), categoryListed);
  add(balanceGaps(closet), categoryListed);
  add(OCCASIONS.flatMap((occasion) => occasionGaps(occasion, closet)), lookListed);
  const partners = outfitPartners(closet);
  add(accentGaps(closet, partners), lookListed);
  gaps.push(...outfitGaps(closet, partners, gaps));
  return gaps.slice(0, MAX_CLOSET_GAPS);
}
