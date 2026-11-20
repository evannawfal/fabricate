import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MESHES_CATEGORIES } from '../../src/config/constants.js';

// Stand-in for the garment builder, which removes the photo's background and edits a 3D model.
// ES modules must be mocked before the service that loads it is imported.
type GarmentOptions = { frontImageBuffer: Buffer; category: string; baseMeshesDir: string };
const processAndApplyGarment = jest.fn<(options: GarmentOptions) => Promise<Uint8Array>>();
jest.unstable_mockModule('../../src/garment/imgToGlb/processGarment.js', () => ({ processAndApplyGarment }));
const { generateGarmentModel, meshTypeFor, referencePointsForItem, UnsupportedGarmentError } = await import(
  '../../src/services/garmentMesh.js'
);

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const BASE_MESHES_DIR = fileURLToPath(new URL('../../src/garment/baseMeshes', import.meta.url));

beforeEach(() => {
  processAndApplyGarment.mockReset();
  processAndApplyGarment.mockResolvedValue(GLB);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Mesh type for a closet item', () => {
  // Input: names that say which garment a top, bottom or outerwear item is
  // Expected output: the mesh for that garment
  test.each([
    ['top', 'White cotton t-shirt', 't-shirt'],
    ['top', 'Band tee', 't-shirt'],
    ['top', 'Oxford shirt', 'shirt'],
    ['top', 'Silk blouse', 'shirt'],
    ['top', 'Grey zip-up hoodie', 'hoodie'],
    ['top', 'Crewneck sweatshirt', 'hoodie'],
    ['bottom', 'Black jeans', 'pants'],
    ['bottom', 'Wool trousers', 'pants'],
    ['bottom', 'Denim shorts', 'shorts'],
    ['bottom', 'Pleated skirt', 'skirt'],
    ['outerwear', 'Zip hoodie jacket', 'hoodie'],
  ])('%s named "%s" uses the %s mesh', (category, name, expected) => {
    expect(meshTypeFor({ category, name })).toBe(expected);
  });

  // Input: names that don't say which garment it is
  // Expected output: the category's default mesh
  test.each([
    ['top', 'Blue top', 't-shirt'],
    ['bottom', 'Plain bottoms', 'pants'],
    ['outerwear', 'Navy wool overcoat', 'hoodie'],
  ])('%s named "%s" falls back to the %s mesh', (category, name, expected) => {
    expect(meshTypeFor({ category, name })).toBe(expected);
  });

  // Input: names of garments from another category
  // Expected behavior: a garment word only counts if the mesh fits the item's category
  // Expected output: the category's default mesh
  test.each([
    ['top', 'Denim shorts', 't-shirt'],
    ['bottom', 'Hoodie', 'pants'],
    ['outerwear', 'Black t-shirt', 'hoodie'],
  ])('%s named "%s" ignores the garment word and uses %s', (category, name, expected) => {
    expect(meshTypeFor({ category, name })).toBe(expected);
  });

  // Input: categories with no base mesh
  // Expected output: undefined
  test.each(['dress', 'shoes', 'accessory'])('No mesh for %s', (category) => {
    expect(meshTypeFor({ category, name: 'Hoodie dress' })).toBeUndefined();
  });

  // Input: every category and garment name above
  // Expected behavior: every mesh type the service can pick is a real base mesh in MESHES_CATEGORIES
  test('Only picks meshes that exist', () => {
    const known = Object.keys(MESHES_CATEGORIES);
    const names = ['Hoodie', 'T-shirt', 'Shirt', 'Shorts', 'Skirt', 'Jeans', 'Plain'];

    for (const category of ['top', 'bottom', 'outerwear']) {
      for (const name of names) {
        expect(known).toContain(meshTypeFor({ category, name }));
      }
    }
  });
});

describe('Garment model generation', () => {
  // Mocked behavior: the garment builder returns a model
  // Input: front photo bytes and the shirt mesh type
  // Expected behavior: the builder gets the photo as a Buffer, the mesh type and a folder that holds
  //   every base mesh
  // Expected output: the builder's model
  test('Passes the photo, mesh type and base mesh folder on', async () => {
    const photo = new Uint8Array([1, 2, 3]);

    const result = await generateGarmentModel(photo, null, 'shirt');

    expect(result).toBe(GLB);
    expect(processAndApplyGarment).toHaveBeenCalledTimes(1);
    const [options] = processAndApplyGarment.mock.calls[0] ?? [];
    expect(Buffer.isBuffer(options?.frontImageBuffer)).toBe(true);
    expect(Array.from(options?.frontImageBuffer ?? [])).toEqual([1, 2, 3]);
    expect(options?.category).toBe('shirt');
    for (const file of Object.values(MESHES_CATEGORIES)) {
      expect(fs.existsSync(path.join(options?.baseMeshesDir ?? '', file))).toBe(true);
    }
  });

  // Mocked behavior: the garment builder throws
  // Input: front photo bytes
  // Expected behavior: the error reaches the caller
  test('Reports a generation failure', async () => {
    processAndApplyGarment.mockRejectedValue(new Error('Forced generation error'));

    await expect(generateGarmentModel(new Uint8Array([1]), null, 'shirt')).rejects.toThrow('Forced generation error');
  });
});

// The service caches the points per base mesh, so each test below uses a mesh no earlier test loaded.
describe('Reference points for a closet item', () => {
  // Input: a t-shirt, asked for twice
  // Expected behavior: the t-shirt's points file is read once, then served from the cache
  // Expected output: the parsed contents of t_shirt.points.json both times
  test('Loads the base mesh points once', () => {
    const expected: unknown = JSON.parse(fs.readFileSync(path.join(BASE_MESHES_DIR, 't_shirt.points.json'), 'utf-8'));
    const readFileSync = jest.spyOn(fs, 'readFileSync');
    const tee = { category: 'top', name: 'Band tee' };

    const first = referencePointsForItem(tee);
    const second = referencePointsForItem(tee);

    expect(first).toEqual(expected);
    expect(second).toBe(first);
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  // Input: a category with no base mesh
  // Expected output: null
  test('No points for an item without a mesh', () => {
    expect(referencePointsForItem({ category: 'shoes', name: 'Sneakers' })).toBeNull();
  });

  // Input: shorts, whose points file is missing
  // Expected behavior: nothing is read
  // Expected output: null
  test('No points when the points file is missing', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const readFileSync = jest.spyOn(fs, 'readFileSync');

    expect(referencePointsForItem({ category: 'bottom', name: 'Denim shorts' })).toBeNull();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  // Input: a skirt, whose points file isn't valid JSON
  // Expected behavior: the error is logged
  // Expected output: null, so the item still loads without points
  test('No points when the points file is unreadable', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{ not json');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(referencePointsForItem({ category: 'bottom', name: 'Pleated skirt' })).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('skirt.points.json'), expect.any(SyntaxError));
  });
});

describe('Unsupported garment error', () => {
  // Expected behavior: the error handler can show it to the app as a 422 with its message
  test('Is a client error that is safe to show', () => {
    const error = new UnsupportedGarmentError("3D models aren't available for dress items yet");

    expect(error).toMatchObject({ status: 422, expose: true, message: "3D models aren't available for dress items yet" });
  });
});
