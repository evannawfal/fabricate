import { jest } from '@jest/globals';
import request from 'supertest';

import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

// Stand-in for the garment builder: the real one removes the photo's background and edits a
// 3D model, which takes seconds and is covered by running the garment scripts. ES modules must be
// mocked before the app is imported. The app loads this module on demand, so the real
// garmentMesh service (mesh choice, errors) still runs.
type GarmentOptions = { frontImageBuffer: Buffer; category: string; baseMeshesDir: string };
const processAndApplyGarment = jest.fn<(options: GarmentOptions) => Promise<Uint8Array>>();
jest.unstable_mockModule('../../src/garment/imgToGlb/processGarment.js', () => ({ processAndApplyGarment }));
const { createApp } = await import('../../src/app.js');
const { ClothingItem } = await import('../../src/models/clothingItem.js');

const app = createApp();

const FRONT_PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const INTERNAL_ERROR = { error: 'Internal server error' };
const NOT_FOUND = { error: 'Clothing item not found' };
const MODEL_KEY_PATTERN = /^garments\/[0-9a-f]{24}\/[0-9a-f]{24}\/[0-9a-f-]{36}\.glb$/;

// Stand-in for file storage (Azure Blob Storage). The front photo is what downloadFile returns.
function mockStorage(options: { downloadError?: Error; uploadError?: Error; deleteError?: Error } = {}) {
  const storage = {
    uploadFile: jest.fn<FileStorage['uploadFile']>(() =>
      options.uploadError ? Promise.reject(options.uploadError) : Promise.resolve()
    ),
    downloadFile: jest.fn<FileStorage['downloadFile']>(() =>
      options.downloadError ? Promise.reject(options.downloadError) : Promise.resolve(FRONT_PHOTO)
    ),
    getDownloadUrl: jest.fn<FileStorage['getDownloadUrl']>((key) => Promise.resolve(`https://storage.test/${key}?sig=test`)),
    deleteFile: jest.fn<FileStorage['deleteFile']>(() =>
      options.deleteError ? Promise.reject(options.deleteError) : Promise.resolve()
    ),
  };
  setFileStorage(storage);
  return storage;
}

function generate(userId: string, itemId: string) {
  return request(app).post(`/clothing/${itemId}/generate`).set('Authorization', authHeader(userId));
}

function getModel(userId: string, itemId: string) {
  return request(app).get(`/clothing/${itemId}/model`).set('Authorization', authHeader(userId));
}

async function modelKeyOf(itemId: string) {
  return (await ClothingItem.findById(itemId))?.modelKey;
}

// Makes a Clothing DB call throw, like a lost database connection would.
function failDatabaseCall(method: 'findOne' | 'findOneAndUpdate') {
  return jest.spyOn(ClothingItem, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
beforeEach(() => {
  processAndApplyGarment.mockReset();
  processAndApplyGarment.mockResolvedValue(GLB);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setFileStorage(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /clothing/:id/generate
describe('Mocked: POST /clothing/:id/generate', () => {
  // Mocked behavior: storage returns the front photo; the garment builder returns a model
  // Input: id of one of the user's items, a hoodie
  // Expected status code: 201
  // Expected behavior: the front photo is downloaded and the hoodie mesh is built from it; the model is
  //   stored under the user's garments/ folder and its key is saved on the item
  // Expected output: { downloadUrl, contentType: "model/gltf-binary", meshType: "hoodie" }
  test('Generates, stores and saves the model', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id, { name: 'Grey zip-up hoodie', imageKey: 'clothing/hoodie-front.jpg' });

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(201);
    expect(storage.downloadFile).toHaveBeenCalledWith('clothing/hoodie-front.jpg');
    expect(processAndApplyGarment).toHaveBeenCalledTimes(1);
    const [options] = processAndApplyGarment.mock.calls[0] ?? [];
    expect(Buffer.from(FRONT_PHOTO).equals(options?.frontImageBuffer as Buffer)).toBe(true);
    expect(options?.category).toBe('hoodie');
    const [key, body, contentType] = storage.uploadFile.mock.calls[0] ?? [];
    expect(key).toMatch(MODEL_KEY_PATTERN);
    expect(key?.startsWith(`garments/${user.id}/${item.id}/`)).toBe(true);
    expect(body).toBe(GLB);
    expect(contentType).toBe('model/gltf-binary');
    expect(response.body).toEqual({
      downloadUrl: `https://storage.test/${key}?sig=test`,
      contentType: 'model/gltf-binary',
      meshType: 'hoodie',
    });
    expect(await modelKeyOf(item.id)).toBe(key);
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  // Mocked behavior: storage and the garment builder succeed
  // Input: a bottom whose name says it is a skirt, and a top with no garment word in its name
  // Expected status code: 201
  // Expected behavior: the mesh comes from the name when it names a fitting garment, and from the
  //   category otherwise
  // Expected output: meshType "skirt", then "t-shirt"
  test('Picks the mesh from the item name and category', async () => {
    mockStorage();
    const user = await createUser();
    const skirt = await createClothingItem(user.id, { name: 'Pleated skirt', category: 'bottom' });
    const top = await createClothingItem(user.id, { name: 'Blue top', category: 'top' });

    const skirtResponse = await generate(user.id, skirt.id);
    const topResponse = await generate(user.id, top.id);

    expect(skirtResponse.body.meshType).toBe('skirt');
    expect(topResponse.body.meshType).toBe('t-shirt');
    expect(processAndApplyGarment.mock.calls.map(([options]) => options.category)).toEqual(['skirt', 't-shirt']);
  });

  // Mocked behavior: storage and the garment builder succeed
  // Input: id of an item that already has a model
  // Expected status code: 201
  // Expected behavior: the new model replaces the old one on the item, and the old model is deleted
  // Expected output: a download link for the new model
  test('Replaces the previous model', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);
    const oldKey = `garments/${user.id}/${item.id}/old.glb`;
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: oldKey });

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(201);
    const newKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(newKey).not.toBe(oldKey);
    expect(await modelKeyOf(item.id)).toBe(newKey);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(oldKey);
  });

  // Mocked behavior: everything succeeds, but deleting the old model fails
  // Input: id of an item that already has a model
  // Expected status code: 201
  // Expected behavior: the new model is saved anyway; the clean-up failure is only logged
  // Expected output: a download link for the new model
  test('Old model clean-up failure is logged, not reported', async () => {
    mockStorage({ deleteError: new Error('Forced delete error') });
    const user = await createUser();
    const item = await createClothingItem(user.id);
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: `garments/${user.id}/${item.id}/old.glb` });

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not delete old garment model/), expect.any(Error));
  });

  // Mocked behavior: storage and the garment builder would succeed
  // Input: id of an item that is a dress, shoes or an accessory
  // Expected status code: 422
  // Expected behavior: nothing is downloaded, generated or stored
  // Expected output: an error saying 3D models aren't available for that category yet
  test.each(['dress', 'shoes', 'accessory'] as const)('Unsupported category: %s', async (category) => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id, { category });

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: `3D models aren't available for ${category} items yet` });
    expect(storage.downloadFile).not.toHaveBeenCalled();
    expect(processAndApplyGarment).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  // Mocked behavior: storage and the garment builder would succeed
  // Input: id of one of the user's archived items, another user's item, and an unknown id
  // Expected status code: 404
  // Expected behavior: nothing is downloaded, generated or stored
  // Expected output: { error: "Clothing item not found" }
  test.each(['archived', 'another user', 'unknown'] as const)('Item not available: %s', async (kind) => {
    const storage = mockStorage();
    const user = await createUser();
    const otherUser = await createUser();
    const ids = {
      archived: (await createClothingItem(user.id, { isArchived: true })).id,
      'another user': (await createClothingItem(otherUser.id)).id,
      unknown: '0123456789abcdef01234567',
    };

    const response = await generate(user.id, ids[kind]);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
    expect(storage.downloadFile).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  // Mocked behavior: storage can't return the front photo
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: nothing is generated or stored; the item is unchanged
  // Expected output: { error: "Internal server error" }
  test('Front photo download fails', async () => {
    const storage = mockStorage({ downloadError: new Error('Forced download error') });
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(processAndApplyGarment).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await modelKeyOf(item.id)).toBeNull();
  });

  // Mocked behavior: the garment builder throws
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: nothing is stored; the item is unchanged
  // Expected output: { error: "Internal server error" }
  test('Generation fails', async () => {
    processAndApplyGarment.mockRejectedValue(new Error('Forced generation error'));
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await modelKeyOf(item.id)).toBeNull();
  });

  // Mocked behavior: storage rejects the upload
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: the item is unchanged
  // Expected output: { error: "Internal server error" }
  test('Model upload fails', async () => {
    mockStorage({ uploadError: new Error('Forced storage error') });
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(await modelKeyOf(item.id)).toBeNull();
  });

  // Mocked behavior: the model is stored, but saving its key on the item throws a database error
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: the stored model is deleted again so no orphaned file is left behind
  // Expected output: { error: "Internal server error" }
  test('Database error removes the stored model', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);
    failDatabaseCall('findOneAndUpdate');

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    const storedKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(storage.deleteFile).toHaveBeenCalledWith(storedKey);
  });

  // Mocked behavior: the item is archived while its model is being generated (saving the key finds nothing)
  // Input: id of one of the user's items
  // Expected status code: 404
  // Expected behavior: the stored model is deleted again; a clean-up failure is only logged
  // Expected output: { error: "Clothing item not found" }
  test('Item archived while generating', async () => {
    const storage = mockStorage({ deleteError: new Error('Forced delete error') });
    const user = await createUser();
    const item = await createClothingItem(user.id);
    jest.spyOn(ClothingItem, 'findOneAndUpdate').mockResolvedValue(null as never);

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
    const storedKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(storage.deleteFile).toHaveBeenCalledWith(storedKey);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not delete orphaned garment model/), expect.any(Error));
  });

  // Mocked behavior: ClothingItem.findOne throws a database error
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; nothing is generated or stored
  // Expected output: { error: "Internal server error" }
  test('Database error while loading the item', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);
    failDatabaseCall('findOne');

    const response = await generate(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});

// Interface GET /clothing/:id/model
describe('Mocked: GET /clothing/:id/model', () => {
  // Mocked behavior: storage signs a link for the model's key
  // Input: id of one of the user's items that has a model
  // Expected status code: 200
  // Expected output: { downloadUrl, contentType: "model/gltf-binary" }
  test('Returns a download link for the model', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);
    const key = `garments/${user.id}/${item.id}/model.glb`;
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: key });

    const response = await getModel(user.id, item.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ downloadUrl: `https://storage.test/${key}?sig=test`, contentType: 'model/gltf-binary' });
    expect(storage.getDownloadUrl).toHaveBeenCalledWith(key);
  });

  // Mocked behavior: storage signs a link for the model's key
  // Input: id of one of the user's archived items that has a model (e.g. shown in a past outfit)
  // Expected status code: 200
  // Expected output: the download link
  test('Archived item keeps its model', async () => {
    mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id, { isArchived: true });
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: 'garments/u/i/model.glb' });

    const response = await getModel(user.id, item.id);

    expect(response.status).toBe(200);
    expect(response.body.downloadUrl).toBe('https://storage.test/garments/u/i/model.glb?sig=test');
  });

  // Mocked behavior: storage is available
  // Input: id of one of the user's items without a model
  // Expected status code: 404
  // Expected behavior: no link is signed
  // Expected output: an error saying no model has been generated yet
  test('Item without a model', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await getModel(user.id, item.id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No 3D model has been generated for this item yet' });
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  // Mocked behavior: storage is available
  // Input: id of another user's item that has a model
  // Expected status code: 404
  // Expected behavior: the other user's model is not revealed
  // Expected output: { error: "Clothing item not found" }
  test("Another user's item", async () => {
    const storage = mockStorage();
    const user = await createUser();
    const otherUser = await createUser();
    const item = await createClothingItem(otherUser.id);
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: 'garments/u/i/model.glb' });

    const response = await getModel(user.id, item.id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  // Mocked behavior: storage can't sign the link
  // Input: id of one of the user's items that has a model
  // Expected status code: 500
  // Expected output: { error: "Internal server error" }
  test('Storage cannot sign the link', async () => {
    const storage = mockStorage();
    storage.getDownloadUrl.mockRejectedValue(new Error('Forced signing error'));
    const user = await createUser();
    const item = await createClothingItem(user.id);
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: 'garments/u/i/model.glb' });

    const response = await getModel(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
  });

  // Mocked behavior: ClothingItem.findOne throws a database error
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no internal details are sent to the client
  // Expected output: { error: "Internal server error" }
  test('Database error', async () => {
    mockStorage();
    const user = await createUser();
    const item = await createClothingItem(user.id);
    failDatabaseCall('findOne');

    const response = await getModel(user.id, item.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });
});
