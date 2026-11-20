import { STYLES, SUGGESTED_COLORS } from '../../src/config/clothingVocabulary.js';
import { MAX_CLOSET_GAPS, MAX_PAIRED_ITEMS } from '../../src/config/constants.js';
import { analyzeClosetGaps, type GapAnalysisItem } from '../../src/services/closetGaps.js';

let nextId = 0;

function item(category: string, color = 'black', style = 'casual'): GapAnalysisItem {
  nextId += 1;
  return { id: `item-${nextId}`, category, color, style };
}

function items(count: number, category: string, color?: string, style?: string): GapAnalysisItem[] {
  return Array.from({ length: count }, () => item(category, color, style));
}

function reasons(closet: GapAnalysisItem[]): string[] {
  return analyzeClosetGaps(closet).map((gap) => gap.reason);
}

function ids(closet: GapAnalysisItem[]): string[] {
  return closet.map(({ id }) => id);
}

// Black tops, bottoms and shoes for every occasion, and a jacket: no category is empty and every
// occasion is covered, so only versatile additions are left to suggest.
function coveredCloset(): GapAnalysisItem[] {
  const looks = ['casual', 'business', 'sporty', 'formal'].flatMap((style) =>
    ['top', 'bottom', 'shoes'].map((category) => item(category, 'black', style))
  );
  return [...looks, item('outerwear')];
}

describe('Closet gap analysis', () => {
  describe('Empty categories', () => {
    // Input: no items
    // Expected behavior: the first MAX_CLOSET_GAPS empty categories, each with the most versatile
    // casual colour for that category, and nothing to pair with
    // Expected output: tops, bottoms and shoes
    test('Lists the basics for an empty closet', () => {
      expect(analyzeClosetGaps([])).toEqual([
        { category: 'top', color: 'white', style: 'casual', reason: 'No tops in your closet', pairsWith: [] },
        { category: 'bottom', color: 'black', style: 'casual', reason: 'No bottoms in your closet', pairsWith: [] },
        { category: 'shoes', color: 'white', style: 'casual', reason: 'No shoes in your closet', pairsWith: [] },
      ]);
      expect(MAX_CLOSET_GAPS).toBe(3);
    });

    // Input: a covered closet with no accessories or dresses
    // Expected behavior: plenty of people don't wear either, so missing them isn't a gap
    // Expected output: no gap mentions them
    test('Never suggests accessories or dresses', () => {
      expect(reasons(coveredCloset()).join()).not.toMatch(/accessor|dress/i);
    });

    // Input: tops, bottoms and a jacket for every occasion, but no shoes
    // Expected behavior: the missing shoes are one gap, not repeated for every occasion
    // Expected output: a single gap mentions shoes
    test('Reports an empty category once', () => {
      const closet = coveredCloset().filter(({ category }) => category !== 'shoes');

      const found = reasons(closet);

      expect(found[0]).toBe('No shoes in your closet');
      expect(found.filter((reason) => reason.includes('shoes'))).toHaveLength(1);
    });
  });

  describe('Tops and bottoms', () => {
    // Input: 20 bottoms and 10 tops, all casual and covering every occasion
    // Expected behavior: fewer tops than bottoms is worth a top
    // Expected output: a top gap
    test('Suggests a top when there are fewer tops than bottoms', () => {
      const closet = [...coveredCloset(), ...items(16, 'bottom'), ...items(6, 'top')];

      expect(analyzeClosetGaps(closet)[0]).toMatchObject({ category: 'top', reason: 'Fewer tops than bottoms in your closet' });
    });

    // Input: 17 tops and 2 bottoms, plus shoes and a jacket
    // Expected behavior: more than MAX_TOPS_PER_BOTTOM tops per bottom is worth a bottom
    // Expected output: a bottom gap
    test('Suggests a bottom when each has to go with too many tops', () => {
      const closet = [...items(17, 'top'), ...items(2, 'bottom'), item('shoes'), item('outerwear')];

      expect(analyzeClosetGaps(closet)[0]).toMatchObject({ category: 'bottom', reason: 'Not many bottoms to wear with your 17 tops' });
    });

    // Input: 8 tops for 2 bottoms (exactly MAX_TOPS_PER_BOTTOM each), then 9
    // Expected behavior: the limit itself is fine, one over isn't
    // Expected output: no bottom gap, then a bottom gap
    test('Accepts exactly the most tops per bottom', () => {
      const base = [...items(2, 'bottom'), item('shoes'), item('outerwear')];

      expect(reasons([...base, ...items(8, 'top')]).join()).not.toContain('Not many bottoms');
      expect(reasons([...base, ...items(9, 'top')])[0]).toBe('Not many bottoms to wear with your 9 tops');
    });

    // Input: 2 tops and 5 bottoms
    // Expected behavior: below MIN_TOPS_AND_BOTTOMS_FOR_BALANCE the balance isn't judged
    // Expected output: no balance gap
    test('Ignores the balance of a small closet', () => {
      const closet = [...items(2, 'top'), ...items(5, 'bottom'), item('shoes'), item('outerwear')];

      expect(reasons(closet).join()).not.toContain('Fewer tops');
    });

    // Input: 12 tops, 2 bottoms and 10 dresses
    // Expected behavior: a dress can't be worn with a top, so it doesn't count as a bottom
    // Expected output: a bottom gap
    test('Leaves dresses out of the balance', () => {
      const closet = [...items(12, 'top'), ...items(2, 'bottom'), ...items(10, 'dress'), item('shoes'), item('outerwear')];

      expect(reasons(closet)[0]).toBe('Not many bottoms to wear with your 12 tops');
    });

    // Input: 20 casual bottoms, 2 casual pairs of shoes and 10 casual tops
    // Expected behavior: shoes and outerwear are only suggested when there are none
    // Expected output: no shoes or outerwear gap
    test('Suggests shoes and outerwear only when there are none', () => {
      const closet = [...items(20, 'bottom'), ...items(10, 'top'), ...items(2, 'shoes'), item('outerwear')];

      expect(analyzeClosetGaps(closet).map(({ category }) => category)).not.toContain('shoes');
      expect(analyzeClosetGaps(closet).map(({ category }) => category)).not.toContain('outerwear');
    });
  });

  describe('Occasions', () => {
    // Input: casual tops, bottoms, shoes and a jacket only
    // Expected behavior: nothing suits work, a workout or a formal event; formal is covered by
    // the work gap, since both styles count as the same look
    // Expected output: work and workout gaps, searching for the first missing piece
    test('Finds occasions the closet cannot dress for', () => {
      const closet = [item('top'), item('bottom'), item('shoes'), item('outerwear')];

      expect(reasons(closet).join()).not.toContain('formal event');
      expect(analyzeClosetGaps(closet).slice(0, 2)).toMatchObject([
        { category: 'top', style: 'business', reason: 'Nothing to wear for work: you have no work tops, bottoms or shoes' },
        { category: 'top', style: 'sporty', reason: 'Nothing to wear for a workout: you have no workout tops, bottoms or shoes' },
      ]);
    });

    // Input: a covered closet without workout shoes
    // Expected behavior: only the missing piece is named and searched for
    // Expected output: a gap for sporty shoes
    test('Names only the missing pieces', () => {
      const closet = coveredCloset().filter(({ category, style }) => !(category === 'shoes' && style === 'sporty'));

      expect(analyzeClosetGaps(closet)[0]).toMatchObject({
        category: 'shoes',
        style: 'sporty',
        reason: 'Nothing to wear for a workout: you have no workout shoes',
      });
    });

    // Input: a covered closet whose formal tops and bottoms are replaced by a formal dress
    // Expected behavior: a dress is a whole outfit
    // Expected output: no formal gap
    test('Counts a dress as an outfit', () => {
      const closet = coveredCloset().filter(({ style }) => style !== 'formal');

      expect(reasons([...closet, item('dress', 'black', 'formal'), item('shoes', 'black', 'formal')]).join()).not.toContain('formal event');
    });

    // Input: casual clothes plus formal ones, but nothing business
    // Expected behavior: formal clothes also suit work
    // Expected output: no work gap
    test('Dresses for work in formal clothes', () => {
      const formal = ['top', 'bottom', 'shoes'].map((category) => item(category, 'black', 'formal'));

      expect(reasons([item('top'), item('bottom'), item('shoes'), item('outerwear'), ...formal]).join()).not.toContain('for work:');
    });
  });

  describe('Suggestions for a complete closet', () => {
    // Input: a covered closet, all black
    // Expected behavior: a closet of almost only neutrals gets one coloured top, the one that
    // would make the most outfits; the suggestions after it don't repeat its colour
    // Expected output: a blue casual top, then a white and a green one
    test('Suggests a colour for an all-neutral closet', () => {
      const gaps = analyzeClosetGaps(coveredCloset());

      expect(gaps[0]).toMatchObject({
        category: 'top',
        color: 'blue',
        style: 'casual',
        reason: 'Your clothes are almost all neutrals: a blue casual top would add colour to 7 new outfits',
      });
      expect(gaps.slice(1).map(({ reason }) => reason)).toEqual([
        'A white casual top would let you make 7 more outfits',
        'A green casual top would let you make 7 more outfits',
      ]);
    });

    // Input: a covered closet with 10 more red tops, so bottoms are the bottleneck but not too few
    // Expected behavior: new bottoms would make the most outfits; one neutral, in the most versatile
    // colour the closet doesn't have yet, then the colours that also go with the red tops
    // Expected output: navy, burgundy and red casual pants
    test('Suggests the pieces that would make the most new outfits', () => {
      const closet = [...coveredCloset(), ...items(10, 'top', 'red')];

      const gaps = analyzeClosetGaps(closet);

      expect(gaps.map(({ category, color }) => `${color} ${category}`)).toEqual(['navy bottom', 'burgundy bottom', 'red bottom']);
      expect(gaps[0]?.reason).toBe('Navy casual pants would let you make 37 more outfits');
    });

    // Input: a covered closet with 12 more red tops and 10 more pairs of black shoes
    // Expected behavior: past MAX_OUTFITS_IN_REASON the exact number means little
    // Expected output: the bottom's reason says "100+"
    test('Rounds large numbers of outfits', () => {
      const closet = [...coveredCloset(), ...items(12, 'top', 'red'), ...items(10, 'shoes')];

      expect(analyzeClosetGaps(closet)[0]?.reason).toBe('Navy casual pants would let you make 100+ more outfits');
    });

    // Input: a covered closet with blue business tops and red business bottoms added
    // Expected behavior: new pieces are suggested in the style the user wears most
    // Expected output: business suggestions only
    test('Suggests the style the user wears most', () => {
      const closet = [...coveredCloset(), ...items(3, 'top', 'blue', 'business'), ...items(3, 'bottom', 'red', 'business')];

      expect(analyzeClosetGaps(closet).map(({ style }) => style)).toEqual(['business', 'business', 'business']);
    });

    // Input: a mostly business closet with a black business top and a white formal top
    // Expected behavior: business and formal count as the same look, so neither a white nor a
    // black business top is suggested
    // Expected output: a navy business top, the next most versatile colour
    test('Treats business and formal as the same look', () => {
      const closet = [...coveredCloset(), item('top', 'white', 'formal'), ...items(3, 'bottom', 'blue', 'business'), ...items(2, 'top', 'blue', 'business')];

      const top = analyzeClosetGaps(closet).find(({ category }) => category === 'top');

      expect(top).toMatchObject({ color: 'navy', style: 'business' });
    });

    // Input: a top in every suggested colour and style, and more bottoms than tops
    // Expected behavior: there's no top left to suggest, so the closet isn't told to buy one,
    // even though it has fewer tops than bottoms
    // Expected output: no top gap
    test('Suggests no top when every look is already owned', () => {
      const tops = STYLES.flatMap((style) => SUGGESTED_COLORS.top.map((color) => item('top', color, style)));
      const closet = [...tops, ...items(tops.length + 1, 'bottom'), item('shoes'), item('outerwear')];

      expect(analyzeClosetGaps(closet).map(({ category }) => category)).not.toContain('top');
    });

    // Input: a covered closet whose items have colours the analysis doesn't know
    // Expected behavior: nothing new would go with them, and a suggestion that makes fewer than
    // MIN_NEW_OUTFITS outfits isn't worth a store search
    // Expected output: no gaps
    test('Leaves out a suggestion that makes too few outfits', () => {
      const closet = coveredCloset().map((covered) => ({ ...covered, color: 'iridescent' }));

      expect(analyzeClosetGaps(closet)).toEqual([]);
    });
  });

  describe('Colours and styles', () => {
    // Input: items with free-text colours and styles, as the classifier writes them
    // Expected behavior: modifiers like "light" are skipped, synonyms are recognised and unknown
    // styles count as casual, so all of them pair with the suggested top; an unknown colour can't be paired
    // Expected output: the suggested top pairs with every item but the iridescent one
    test('Recognises free-text colours and styles', () => {
      const known = [
        item('bottom', 'Light Heather Grey', 'Smart Casual'),
        item('bottom', 'dark wash denim', 'athleisure'),
        item('shoes', 'off-white', 'CASUAL'),
        item('outerwear', 'Forest-Green', 'cottagecore'),
      ];
      const unknown = item('bottom', 'iridescent');

      const [gap] = analyzeClosetGaps([...known, unknown]);

      expect(gap).toMatchObject({ category: 'top', reason: 'No tops in your closet', color: 'white' });
      expect(gap?.pairsWith.sort()).toEqual(ids(known).sort());
    });

    // Input: a striped and a multicolour bottom, with no tops
    // Expected behavior: patterns are recognised even next to a colour, and go with neutrals
    // Expected output: the white top pairs with both
    test('Pairs patterns with neutrals', () => {
      const closet = [item('bottom', 'blue and white striped'), item('bottom', 'multicolor')];

      expect(analyzeClosetGaps(closet)[0]?.pairsWith).toEqual(ids(closet));
    });

    // Input: casual tops in every neutral, and black, blue, red and multicolour bottoms
    // Expected behavior: with neutrals owned, the top is a colour; it goes with neutrals and its
    // own family, but not another family or a pattern
    // Expected output: a blue top paired with the black bottoms and the blue one
    test('Pairs a colour with neutrals and its own family', () => {
      const tops = ['white', 'black', 'navy', 'grey', 'beige', 'olive', 'brown'].map((color) => item('top', color));
      const black = items(5, 'bottom');
      const blue = item('bottom', 'blue');
      const closet = [...tops, ...black, blue, item('bottom', 'red'), item('bottom', 'multicolor')];

      const gap = analyzeClosetGaps(closet).find(({ reason }) => reason === 'Fewer tops than bottoms in your closet');

      expect(gap).toMatchObject({ color: 'blue', style: 'casual' });
      expect(gap?.pairsWith.sort()).toEqual([...ids(black), blue.id].sort());
    });

    // Input: formal and sporty bottoms and casual dresses, with no tops
    // Expected behavior: the top is casual, the style worn most, and only pairs with styles that work with it
    // Expected output: the top pairs with the sporty bottom only
    test('Pairs styles that work together', () => {
      const formal = item('bottom', 'black', 'formal');
      const sporty = item('bottom', 'black', 'sporty');

      expect(analyzeClosetGaps([formal, sporty, ...items(2, 'dress')])[0]).toMatchObject({ style: 'casual', pairsWith: [sporty.id] });
    });
  });

  describe('Pairings', () => {
    // Input: a dress, a bottom and an accessory, with no shoes or tops
    // Expected behavior: shoes go with anything
    // Expected output: the shoes pair with all three
    test('Pairs shoes with every other category', () => {
      const closet = [item('dress'), item('bottom'), item('accessory')];

      const shoes = analyzeClosetGaps(closet).find(({ category }) => category === 'shoes');

      expect(shoes?.pairsWith).toEqual(ids(closet));
    });

    // Input: a dress and bottoms, with no tops
    // Expected behavior: a top can't be worn with a dress
    // Expected output: the top's pairings leave out the dress
    test('Never pairs a top or bottom with a dress', () => {
      const dress = item('dress');

      const [gap] = analyzeClosetGaps([dress, ...items(3, 'bottom')]);

      expect(gap?.category).toBe('top');
      expect(gap?.pairsWith).not.toContain(dress.id);
    });

    // Input: 10 tops listed before 2 bottoms, with no shoes
    // Expected behavior: pairings come from each category in turn, capped at MAX_PAIRED_ITEMS
    // Expected output: a top and a bottom first, both bottoms included
    test('Spreads and caps the pairings', () => {
      const tops = items(10, 'top');
      const bottoms = items(2, 'bottom');

      const shoes = analyzeClosetGaps([...tops, ...bottoms]).find(({ category }) => category === 'shoes');

      expect(shoes?.pairsWith).toHaveLength(MAX_PAIRED_ITEMS);
      expect(shoes?.pairsWith.slice(0, 2)).toEqual([tops[0]?.id, bottoms[0]?.id]);
      expect(shoes?.pairsWith).toContain(bottoms[1]?.id);
    });

    // Input: the same closet twice
    // Expected behavior: no randomness, so results are stable for tests and the Shop screen
    // Expected output: identical gaps
    test('Gives the same result every time', () => {
      const closet = [...items(8, 'top'), item('bottom'), item('shoes')];

      expect(analyzeClosetGaps(closet)).toEqual(analyzeClosetGaps(closet));
    });
  });
});
