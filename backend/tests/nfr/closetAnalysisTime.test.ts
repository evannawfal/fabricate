import { performance } from 'node:perf_hooks';

import {
  CLOSET_ANALYSIS_MAX_ITEMS,
  CLOSET_ANALYSIS_TIME_LIMIT_MS,
  COLOR_FAMILIES,
  STYLE_PAIRINGS,
} from '../../src/config/constants.js';
import { ClothingItem, type ClothingCategory } from '../../src/models/clothingItem.js';
import { analyzeClosetGaps } from '../../src/services/closetGaps.js';
import { DATABASE_SETUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from '../helpers/database.js';
import { createUser } from '../helpers/fixtures.js';

const RUNS = 10;

// Every category clears its minimum share, so the analysis also runs the versatile-item search, its slowest path.
const ITEMS_PER_CATEGORY: Record<ClothingCategory, number> = {
  top: 200,
  bottom: 125,
  shoes: 75,
  outerwear: 50,
  dress: 25,
  accessory: 25,
};

const COLORS = Object.values(COLOR_FAMILIES).flat();
const STYLES = Object.keys(STYLE_PAIRINGS);

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterAll(stopTestDatabase);

async function seedCloset(ownerId: string): Promise<void> {
  const categories = Object.entries(ITEMS_PER_CATEGORY).flatMap(([category, count]) =>
    Array<string>(count).fill(category)
  );
  await ClothingItem.insertMany(
    categories.map((category, index) => ({
      owner: ownerId,
      name: `Item ${index}`,
      category,
      color: COLORS[index % COLORS.length],
      style: STYLES[index % STYLES.length],
      imageKey: `clothing/nfr-${index}.jpg`,
    }))
  );
}

// One indexed query, then everything in memory, as in Requirements_and_Design.md section 4.7.
async function timeClosetAnalysis(ownerId: string): Promise<{ elapsedMs: number; gapCount: number }> {
  const start = performance.now();
  const items = await ClothingItem.find({ owner: ownerId, isArchived: false }, 'category color style').lean();
  const gaps = analyzeClosetGaps(
    items.map(({ _id, category, color, style }) => ({ id: _id.toString(), category, color, style }))
  );
  return { elapsedMs: performance.now() - start, gapCount: gaps.length };
}

// NFR: Closet analysis time
describe('NFR: closet gap analysis time', () => {
  // Input: a 500-item closet covering every category, colour and style, analysed 10 times
  // Expected behavior: each run loads the closet from the database and finds its gaps
  // Expected output: every run finishes within 2 seconds
  test('Analyzes a 500-item closet within 2 seconds', async () => {
    const user = await createUser();
    await seedCloset(user.id);

    const runs = [];
    for (let run = 0; run < RUNS; run += 1) {
      runs.push(await timeClosetAnalysis(user.id));
    }

    const times = runs.map(({ elapsedMs }) => elapsedMs);
    console.log(
      `Closet analysis of ${CLOSET_ANALYSIS_MAX_ITEMS} items over ${RUNS} runs (limit ${CLOSET_ANALYSIS_TIME_LIMIT_MS} ms): ` +
        `max ${Math.max(...times).toFixed(1)} ms, mean ${(times.reduce((a, b) => a + b, 0) / RUNS).toFixed(1)} ms, ` +
        `runs [${times.map((ms) => ms.toFixed(1)).join(', ')}] ms, ${runs[0]?.gapCount} gap(s) found`
    );
    expect(await ClothingItem.countDocuments({ owner: user.id })).toBe(CLOSET_ANALYSIS_MAX_ITEMS);
    for (const elapsedMs of times) {
      expect(elapsedMs).toBeLessThan(CLOSET_ANALYSIS_TIME_LIMIT_MS);
    }
  });
});
