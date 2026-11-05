import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Stand-in for the background-removal model, which is slow and downloads nothing in tests.
// ES modules must be mocked before the module that loads them is imported.
const removeBackground = jest.fn<(image: Blob, config: unknown) => Promise<Blob>>();
jest.unstable_mockModule('@imgly/background-removal-node', () => ({ removeBackground }));
const { extractPrimaryColourFromBuffer, processAndApplyGarment } = await import(
  '../../src/garment/imgToGlb/processGarment.js'
);
const { applySolidColour } = await import('../../src/garment/imgToGlb/applySolidColor.js');

const BASE_MESHES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/garment/baseMeshes');
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

type Rgba = [number, number, number, number];
type Material = Record<string, unknown> & { pbrMetallicRoughness?: Record<string, unknown> };

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'garment-test-'));
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  removeBackground.mockReset();
});

function chunk(type: number, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(data.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, data]);
}

function glb(chunks: Buffer[], { magic = 'glTF', version = 2 } = {}): Buffer {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write(magic, 0, 'ascii');
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

function jsonChunk(json: unknown): Buffer {
  return chunk(JSON_CHUNK, Buffer.from(JSON.stringify(json), 'utf8'));
}

async function writeGlb(name: string, contents: Buffer): Promise<string> {
  const filePath = path.join(tempDir, name);
  await fs.writeFile(filePath, contents);
  return filePath;
}

function readGlb(bytes: Uint8Array): { length: number; json: { materials: Material[] }; bin: Buffer | undefined } {
  const buffer = Buffer.from(bytes);
  let json: { materials: Material[] } | undefined;
  let bin: Buffer | undefined;
  for (let offset = 12; offset < buffer.length; ) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      expect(length % 4).toBe(0);
      json = JSON.parse(data.toString('utf8')) as { materials: Material[] };
    }
    if (type === BIN_CHUNK) bin = data;
    offset += 8 + length;
  }
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  return { length: buffer.readUInt32LE(8), json: requireValue(json), bin };
}

function requireValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing value');
  return value;
}

// A PNG made of the given RGBA pixels in one row, as the background remover returns it.
async function png(pixels: Rgba[]): Promise<Buffer> {
  return sharp(Buffer.from(pixels.flat()), { raw: { width: pixels.length, height: 1, channels: 4 } })
    .png()
    .toBuffer();
}

function removedBackground(pixels: Rgba[]) {
  removeBackground.mockImplementation(async () => new Blob([new Uint8Array(await png(pixels))], { type: 'image/png' }));
}

describe('Applying a solid colour to a garment model', () => {
  // Input: the real pants base mesh and a colour
  // Expected behavior: every material gets the colour, a matte finish and no textures; the mesh data is kept
  // Expected output: a valid GLB whose header length matches its size
  test('Colours a real base mesh', async () => {
    const inputPath = path.join(BASE_MESHES_DIR, 'pants.glb');
    const original = readGlb(await fs.readFile(inputPath));

    const result = readGlb(await applySolidColour({ inputPath, colour: '#3366CC' }));

    expect(result.json.materials).toHaveLength(original.json.materials.length);
    for (const material of result.json.materials) {
      expect(material.pbrMetallicRoughness).toMatchObject({
        baseColorFactor: [0x33 / 255, 0x66 / 255, 0xcc / 255, 1],
        roughnessFactor: 0.85,
        metallicFactor: 0,
      });
      expect(material.pbrMetallicRoughness).not.toHaveProperty('baseColorTexture');
      expect(material).not.toHaveProperty('normalTexture');
      expect(material).not.toHaveProperty('emissiveTexture');
    }
    expect(result.bin?.equals(requireValue(original.bin))).toBe(true);
  });

  // Input: a model whose material has textures and no PBR settings, with an extra chunk of an unknown type
  // Expected behavior: the material gets PBR settings, its textures are removed and the unknown chunk is dropped
  // Expected output: a GLB with only the JSON and binary chunks
  test('Adds PBR settings and removes textures', async () => {
    const material = { name: 'cloth', normalTexture: { index: 0 }, emissiveTexture: { index: 1 } };
    const bin = Buffer.from([1, 2, 3, 4]);
    const inputPath = await writeGlb(
      'textured.glb',
      glb([jsonChunk({ materials: [material] }), chunk(0x12345678, Buffer.from([9, 9, 9, 9])), chunk(BIN_CHUNK, bin)])
    );

    const bytes = await applySolidColour({ inputPath, colour: '#FFFFFF' });
    const result = readGlb(bytes);

    expect(result.json.materials).toEqual([
      { name: 'cloth', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], roughnessFactor: 0.85, metallicFactor: 0 } },
    ]);
    expect(result.bin).toEqual(bin);
    expect(result.length).toBe(bytes.length);
  });

  // Input: a model without a binary chunk and a three-digit colour
  // Expected behavior: the colour is expanded to six digits
  // Expected output: a GLB with only a JSON chunk
  test('Handles a three-digit colour and no binary chunk', async () => {
    const inputPath = await writeGlb('no-bin.glb', glb([jsonChunk({ materials: [{}] })]));

    const bytes = await applySolidColour({ inputPath, colour: '#F00' });
    const result = readGlb(bytes);

    expect(result.json.materials[0]?.pbrMetallicRoughness?.baseColorFactor).toEqual([1, 0, 0, 1]);
    expect(result.bin).toBeUndefined();
    expect(result.length).toBe(bytes.length);
  });

  // Input: files that aren't usable GLB models
  // Expected behavior: nothing is generated
  // Expected output: an error naming the problem
  test.each([
    ['not a GLB file', () => glb([jsonChunk({ materials: [{}] })], { magic: 'abcd' }), "Missing 'glTF' magic bytes"],
    ['GLB version 1', () => glb([jsonChunk({ materials: [{}] })], { version: 1 }), 'Unsupported GLB version: 1'],
    ['no JSON chunk', () => glb([chunk(BIN_CHUNK, Buffer.from([0, 0, 0, 0]))]), 'GLB JSON chunk not found'],
    ['no materials', () => glb([jsonChunk({ meshes: [] })]), 'No materials found'],
    ['an empty material list', () => glb([jsonChunk({ materials: [] })]), 'No materials found'],
  ])('Rejects a model with %s', async (name, contents, message) => {
    const inputPath = await writeGlb(`${name.replace(/ /g, '-')}.glb`, contents());

    await expect(applySolidColour({ inputPath, colour: '#000000' })).rejects.toThrow(message);
  });
});

describe('Primary colour of a garment photo', () => {
  // Input: a photo whose background removal leaves blue garment pixels and a transparent background
  // Expected behavior: the photo is sent to the background remover as a PNG request
  // Expected output: the garment's colour as a hex string
  test('Ignores the transparent background', async () => {
    removedBackground([
      [0, 0, 255, 255],
      [255, 255, 255, 0],
      [0, 0, 255, 255],
      [255, 0, 0, 128],
    ]);
    const photo = Buffer.from('photo');

    await expect(extractPrimaryColourFromBuffer(photo)).resolves.toBe('#0000FF');

    const [image, config] = requireValue(removeBackground.mock.calls[0]);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(photo);
    expect(config).toEqual({ output: { format: 'image/png' } });
  });

  // Input: a garment made of black and white pixels
  // Expected output: their average, grey
  test('Averages the garment pixels', async () => {
    removedBackground([
      [0, 0, 0, 255],
      [254, 254, 254, 255],
    ]);

    await expect(extractPrimaryColourFromBuffer(Buffer.from('photo'))).resolves.toBe('#7F7F7F');
  });

  // Input: a photo where background removal left nothing
  // Expected output: white
  test('Falls back to white when nothing is left', async () => {
    removedBackground([[10, 20, 30, 0]]);

    await expect(extractPrimaryColourFromBuffer(Buffer.from('photo'))).resolves.toBe('#FFFFFF');
  });
});

describe('Building a garment model from a photo', () => {
  // Input: a photo of a red garment and the pants mesh type
  // Expected output: the pants model coloured red
  test('Colours the base mesh with the photo colour', async () => {
    removedBackground([[255, 0, 0, 255]]);

    const bytes = await processAndApplyGarment({
      frontImageBuffer: Buffer.from('photo'),
      category: 'pants',
      baseMeshesDir: BASE_MESHES_DIR,
    });

    for (const material of readGlb(bytes).json.materials) {
      expect(material.pbrMetallicRoughness?.baseColorFactor).toEqual([1, 0, 0, 1]);
    }
  });

  // Input: a mesh type without a base mesh
  // Expected behavior: the photo is not processed
  // Expected output: an error naming the type
  test('Rejects an unknown mesh type', async () => {
    await expect(
      processAndApplyGarment({ frontImageBuffer: Buffer.from('photo'), category: 'scarf', baseMeshesDir: BASE_MESHES_DIR })
    ).rejects.toThrow('Unsupported garment category: scarf');
    expect(removeBackground).not.toHaveBeenCalled();
  });
});
