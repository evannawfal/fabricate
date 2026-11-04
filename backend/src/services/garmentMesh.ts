import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_MESHES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../garment/baseMeshes');

// Which base meshes each closet category can use; the first is the default.
const MESHES_BY_CATEGORY: Record<string, string[]> = {
  top: ['t-shirt', 'shirt', 'hoodie'],
  bottom: ['pants', 'shorts', 'skirt'],
  outerwear: ['hoodie'],
};

// Order matters: "t-shirt" must be tested before "shirt".
const NAME_KEYWORDS: [RegExp, string][] = [
  [/hood(ie|y)|sweatshirt/i, 'hoodie'],
  [/t-?shirt|\btee\b/i, 't-shirt'],
  [/shorts/i, 'shorts'],
  [/skirt/i, 'skirt'],
  [/pants|jeans|trousers|chinos|joggers|leggings/i, 'pants'],
  [/shirt|blouse/i, 'shirt'],
];

export class UnsupportedGarmentError extends Error {
  readonly status = 422;
  readonly expose = true;
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedGarmentError';
  }
}

export function meshTypeFor(item: { category: string; name: string }): string | undefined {
  const allowed = MESHES_BY_CATEGORY[item.category];
  if (allowed === undefined) return undefined;
  const byName = NAME_KEYWORDS.find(([pattern, type]) => allowed.includes(type) && pattern.test(item.name));
  return byName?.[1] ?? allowed[0];
}

export async function generateGarmentModel(frontImage: Uint8Array, meshType: string): Promise<Uint8Array> {
  // Loaded on first use so sharp and the background-removal model don't slow down or break server startup.
  const { processAndApplyGarment } = await import('../garment/imgToGlb/processGarment.js');
  return processAndApplyGarment({
    frontImageBuffer: Buffer.from(frontImage),
    category: meshType,
    baseMeshesDir: BASE_MESHES_DIR,
  });
}