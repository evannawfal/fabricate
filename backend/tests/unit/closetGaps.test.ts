import { MAX_PAIRED_ITEMS, STYLE_PAIRINGS } from '../../src/config/constants.js';
import { analyzeClosetGaps, type GapAnalysisItem } from '../../src/services/closetGaps.js';

const ALL_STYLES = Object.keys(STYLE_PAIRINGS);

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

describe('Closet gap analysis', () => {
  describe('Empty and small closets', () => {
    // Input: no items
    // Expected behavior: every everyday category is missing and there is nothing to pair with
    // Expected output: four gaps with no colour, style or pairings
    test('Lists the basics for an empty closet', () => {
      expect(analyzeClosetGaps([])).toEqual([
        { category: 'top', reason: 'No tops in your closet', pairsWith: [] },
        { category: 'bottom', reason: 'No bottoms in your closet', pairsWith: [] },
        { category: 'shoes', reason: 'No shoes in your closet', pairsWith: [] },
        { category: 'outerwear', reason: 'No outerwear in your closet', pairsWith: [] },
      ]);
    });

    // Input: 9 items, 8 of them tops
    // Expected behavior: shares aren't used below 10 items, so one bottom isn't called too few
    // Expected output: only the empty categories
    test('Ignores shares in a small closet', () => {
      const closet = [...items(8, 'top'), item('bottom')];

      expect(reasons(closet).slice(0, 2)).toEqual(['No shoes in your closet', 'No outerwear in your closet']);
      expect(reasons(closet).join()).not.toContain('Not many');
    });

    // Input: one item of each everyday category
    // Expected behavior: nothing is empty, but a small closet still gets a useful suggestion
    // Expected output: one versatile gap
    test('Suggests a versatile item when a small closet has every category', () => {
      const closet = [item('top'), item('bottom'), item('shoes'), item('outerwear')];

      expect(reasons(closet)).toEqual(['A neutral business top would go with 3 of your items']);
    });
  });

  describe('Shares of the closet', () => {
    // Input: 20 items with 2 bottoms, 1 pair of shoes and no outerwear
    // Expected behavior: empty categories come before thin ones, and no versatile item is added
    // even though every category has been reported, so a tops-heavy closet isn't told to buy more tops
    // Expected output: outerwear, then bottoms, then shoes
    test('Orders gaps from most to least important', () => {
      const closet = [...items(17, 'top'), ...items(2, 'bottom'), item('shoes')];

      expect(reasons(closet)).toEqual([
        'No outerwear in your closet',
        'Not many bottoms compared to the rest of your closet',
        'Not many pairs of shoes compared to the rest of your closet',
      ]);
    });

    // Input: 100 items with bottoms, shoes and outerwear exactly at their minimum shares
    // Expected behavior: a category at its minimum isn't underrepresented
    // Expected output: no "Not many" gaps
    test('Accepts a category exactly at its minimum share', () => {
      const closet = [...items(72, 'top'), ...items(15, 'bottom'), ...items(8, 'shoes'), ...items(5, 'outerwear')];

      expect(reasons(closet).join()).not.toContain('Not many');
    });

    // Input: the same closet with one fewer pair of shoes
    // Expected behavior: just under the minimum counts as thin
    // Expected output: a shoes gap
    test('Flags a category just under its minimum share', () => {
      const closet = [...items(73, 'top'), ...items(15, 'bottom'), ...items(7, 'shoes'), ...items(5, 'outerwear')];

      expect(reasons(closet)).toEqual(['Not many pairs of shoes compared to the rest of your closet']);
    });

    // Input: 12 wearable items in good balance, plus 14 accessories
    // Expected behavior: accessories aren't part of the total, so they don't make the rest look thin
    // Expected output: no "Not many" gaps
    test('Leaves accessories out of the shares', () => {
      const closet = [...items(6, 'top'), ...items(3, 'bottom'), ...items(2, 'shoes'), item('outerwear'), ...items(14, 'accessory')];

      expect(reasons(closet).join()).not.toContain('Not many');
    });

    // Input: 9 wearable items, mostly tops, plus 14 accessories
    // Expected behavior: accessories don't push a small closet over the cutoff for using shares
    // Expected output: no "Not many" gaps
    test('Leaves accessories out of the closet size cutoff', () => {
      const closet = [...items(8, 'top'), item('bottom'), ...items(14, 'accessory')];

      expect(reasons(closet).join()).not.toContain('Not many');
    });

    // Input: dresses, shoes and outerwear, but no tops or bottoms
    // Expected behavior: dresses fill in for tops and bottoms
    // Expected output: no gap in tops or bottoms
    test('Counts dresses towards tops and bottoms', () => {
      const closet = [...items(6, 'dress'), ...items(2, 'shoes'), ...items(2, 'outerwear')];

      expect(reasons(closet).join()).not.toMatch(/tops|bottoms/);
    });
  });

  describe('Colours and styles', () => {
    // Input: free-text colours and styles in different forms
    // Expected behavior: each one is matched by a word it contains, in any case
    // Expected output: all three items pair with the suggested top
    test('Recognises free-text colours and styles', () => {
      const closet = [item('bottom', 'Light Grey', 'Smart Casual'), item('shoes', 'navy-blue', 'casual'), item('outerwear', 'off white', 'CASUAL')];

      const [gap] = analyzeClosetGaps(closet);

      expect(gap).toMatchObject({ category: 'top', colorFamily: 'neutral', style: 'casual' });
      expect(gap?.pairsWith).toEqual(closet.map(({ id }) => id));
    });

    // Input: items whose colours and styles aren't recognised
    // Expected behavior: unknown values can't be paired, so no colour or style is suggested
    // Expected output: the gap has only a category and reason
    test('Leaves out colours and styles it does not recognise', () => {
      const closet = [item('top', 'multicolor', 'casual'), item('bottom', 'black', 'vintage')];

      expect(analyzeClosetGaps(closet)[0]).toEqual({ category: 'shoes', reason: 'No shoes in your closet', pairsWith: [] });
    });

    // Input: every neutral look already owned, plus a red and a blue casual bottom
    // Expected behavior: with neutrals taken, the suggestion is a warm top; it pairs with the
    // 15 neutral items in matching styles and the red bottom, but not the blue one
    // Expected output: a warm casual top that goes with 16 items
    test('Pairs a colour with neutrals and its own family', () => {
      const neutrals = ['top', 'bottom', 'shoes', 'outerwear'].flatMap((category) =>
        ALL_STYLES.map((style) => item(category, 'black', style))
      );
      const closet = [...neutrals, item('bottom', 'red'), item('bottom', 'blue')];

      expect(analyzeClosetGaps(closet)).toMatchObject([
        { category: 'top', colorFamily: 'warm', style: 'casual', reason: 'A warm casual top would go with 16 of your items' },
      ]);
    });

    // Input: formal and sporty bottoms
    // Expected behavior: a top's style only pairs with styles that work with it
    // Expected output: the suggested casual top pairs with the sporty bottom only
    test('Pairs styles that work together', () => {
      const formal = item('bottom', 'black', 'formal');
      const sporty = item('bottom', 'black', 'sporty');

      const gap = analyzeClosetGaps([formal, sporty]).find(({ category }) => category === 'top');

      expect(gap).toMatchObject({ style: 'casual', pairsWith: [sporty.id] });
    });
  });

  describe('Pairings', () => {
    // Input: a dress, a bottom and an accessory, with no shoes
    // Expected behavior: shoes go with anything
    // Expected output: the shoes pair with all three
    test('Pairs shoes with every other category', () => {
      const dress = item('dress');
      const bottom = item('bottom');
      const accessory = item('accessory');

      expect(analyzeClosetGaps([dress, bottom, accessory])[0]?.pairsWith).toEqual([dress.id, bottom.id, accessory.id]);
    });

    // Input: a dress as the only "top" in a 10-item closet
    // Expected behavior: a top can't be worn with a dress, or paired with its own category
    // Expected output: the top's pairings leave out the dress
    test('Never pairs a top or bottom with a dress', () => {
      const dress = item('dress');
      const closet = [dress, ...items(3, 'bottom'), ...items(3, 'shoes'), ...items(3, 'outerwear')];

      const [gap] = analyzeClosetGaps(closet);

      expect(gap?.category).toBe('top');
      expect(gap?.pairsWith).toHaveLength(MAX_PAIRED_ITEMS);
      expect(gap?.pairsWith).not.toContain(dress.id);
    });

    // Input: 20 items that all pair with the suggested shoes
    // Expected behavior: the list stays short enough to show on a phone
    // Expected output: MAX_PAIRED_ITEMS ids
    test('Caps the pairings', () => {
      const closet = [...items(10, 'top'), ...items(10, 'bottom')];

      expect(analyzeClosetGaps(closet)[0]?.pairsWith).toHaveLength(MAX_PAIRED_ITEMS);
    });

    // Input: 10 tops listed before 2 bottoms, with no shoes
    // Expected behavior: pairings come from each category in turn, not just the first in the closet
    // Expected output: the first two pairings are a top and a bottom, and both bottoms are included
    test('Spreads the pairings across categories', () => {
      const tops = items(10, 'top');
      const bottoms = items(2, 'bottom');

      const pairsWith = analyzeClosetGaps([...tops, ...bottoms])[0]?.pairsWith ?? [];

      expect(pairsWith.slice(0, 2)).toEqual([tops[0]?.id, bottoms[0]?.id]);
      expect(pairsWith).toContain(bottoms[1]?.id);
    });
  });

  describe('Versatile item', () => {
    // Input: a balanced closet of neutral casual items
    // Expected behavior: neutral casual would score highest, but it's already owned everywhere
    // Expected output: the next-best look, a bottom because the closet has the most tops to wear it with
    test('Skips looks the closet already owns', () => {
      const closet = [...items(4, 'top'), ...items(2, 'bottom'), ...items(2, 'shoes'), ...items(2, 'outerwear')];

      expect(analyzeClosetGaps(closet)).toMatchObject([{ category: 'bottom', colorFamily: 'neutral', style: 'business' }]);
    });

    // Input: a closet that owns every look in every everyday category
    // Expected behavior: there is nothing left to suggest
    // Expected output: no gaps
    test('Finds no gaps in a full closet', () => {
      const looks = ['white', 'red', 'blue'].flatMap((color) =>
        ALL_STYLES.map((style) => ({ color, style }))
      );
      const closet = ['top', 'bottom', 'shoes', 'outerwear'].flatMap((category) =>
        looks.map(({ color, style }) => item(category, color, style))
      );

      expect(analyzeClosetGaps(closet)).toEqual([]);
    });

    // Input: every category filled, but only one item with a recognised colour and style
    // Expected behavior: a suggestion that pairs with a single item isn't worth a store search
    // Expected output: no gaps
    test('Leaves out a suggestion that pairs with too few items', () => {
      const closet = [item('top', 'black', 'vintage'), item('bottom', 'black', 'vintage'), item('shoes', 'black', 'vintage'), item('outerwear')];

      expect(analyzeClosetGaps(closet)).toEqual([]);
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
