import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import { Outfit } from '../../src/models/outfit.js';
import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createOutfit, createUser } from '../helpers/fixtures.js';

const app = createApp();

const INTERNAL_ERROR = { error: 'Internal server error' };

// Makes an Outfit DB call throw, like a lost database connection would.
function failOutfitCall(method: 'create' | 'find' | 'findOne' | 'findOneAndUpdate' | 'findOneAndDelete') {
  return jest.spyOn(Outfit, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

async function userWithOutfit() {
  const user = await createUser();
  const shirt = await createClothingItem(user.id);
  const outfit = await createOutfit(user.id, [shirt.id]);
  return { user, shirt, outfit };
}

function expectInternalErrorLogged() {
  expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
// The error handler logs every 500. Silencing it keeps the forced errors out of the test output,
// and the spy lets tests check that the error was logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setFileStorage(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /outfits
describe('Mocked: POST /outfits', () => {
  // Mocked behavior: ClothingItem.countDocuments throws while checking the items are in the user's closet
  // Input: name and one of the user's items
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no outfit is saved
  // Expected output: { error: "Internal server error" }
  test('Clothing DB error while checking the items', async () => {
    const user = await createUser();
    const shirt = await createClothingItem(user.id);
    const countDocuments = jest.spyOn(ClothingItem, 'countDocuments').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Look', items: [shirt.id] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(countDocuments).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Mocked behavior: Outfit.create throws a database error
  // Input: name and one of the user's items
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no outfit is saved
  // Expected output: { error: "Internal server error" }
  test('Outfit DB error while saving', async () => {
    const user = await createUser();
    const shirt = await createClothingItem(user.id);
    const create = failOutfitCall('create');

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Look', items: [shirt.id] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(create).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
    expect(await Outfit.countDocuments()).toBe(0);
  });
});

// Interface GET /outfits
describe('Mocked: GET /outfits', () => {
  // Mocked behavior: file storage (Azure Blob Storage) can't create a download link
  // Input: signed-in user with one outfit
  // Expected status code: 200
  // Expected behavior: the outfits still load; their items just have no photo link
  // Expected output: the outfit with its item's imageUrl null
  test('Outfits load without photo links when storage fails', async () => {
    const getDownloadUrl = jest.fn(async (_key: string): Promise<string> => {
      throw new Error('Forced signing error');
    });
    setFileStorage({ getDownloadUrl } as unknown as FileStorage);
    const { user } = await userWithOutfit();

    const response = await request(app).get('/outfits').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.outfits).toHaveLength(1);
    expect(response.body.outfits[0].items[0].imageUrl).toBeNull();
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  // Mocked behavior: Outfit.find throws a database error
  // Input: signed-in user with one outfit
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no internal details are sent to the client
  // Expected output: { error: "Internal server error" }
  test('Outfit DB error', async () => {
    const { user } = await userWithOutfit();
    const find = failOutfitCall('find');

    const response = await request(app).get('/outfits').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(find).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
  });

  // Mocked behavior: ClothingItem.find throws while loading the outfits' items
  // Input: signed-in user with one outfit
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no internal details are sent to the client
  // Expected output: { error: "Internal server error" }
  test('Clothing DB error while loading the items', async () => {
    const { user } = await userWithOutfit();
    const find = jest.spyOn(ClothingItem, 'find').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app).get('/outfits').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(find).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
  });
});

// Interface GET /outfits/:id
describe('Mocked: GET /outfits/:id', () => {
  // Mocked behavior: Outfit.findOne throws a database error
  // Input: id of one of the user's outfits
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no internal details are sent to the client
  // Expected output: { error: "Internal server error" }
  test('Outfit DB error', async () => {
    const { user, outfit } = await userWithOutfit();
    const findOne = failOutfitCall('findOne');

    const response = await request(app).get(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOne).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
  });
});

// Interface PATCH /outfits/:id
describe('Mocked: PATCH /outfits/:id', () => {
  // Mocked behavior: Outfit.findOne throws while loading the outfit to update
  // Input: id of one of the user's outfits and a new name
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the outfit is unchanged
  // Expected output: { error: "Internal server error" }
  test('Outfit DB error while loading the outfit', async () => {
    const { user, outfit } = await userWithOutfit();
    const findOne = failOutfitCall('findOne');

    const response = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Renamed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOne).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
    // findById calls findOne internally, so it would throw too while the spy is in place.
    findOne.mockRestore();
    expect((await Outfit.findById(outfit.id))?.name).toBe(outfit.name);
  });

  // Mocked behavior: Outfit.findOneAndUpdate throws a database error
  // Input: id of one of the user's outfits and a new name
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the outfit is unchanged
  // Expected output: { error: "Internal server error" }
  test('Outfit DB error while saving', async () => {
    const { user, outfit } = await userWithOutfit();
    const findOneAndUpdate = failOutfitCall('findOneAndUpdate');

    const response = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Renamed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
    expect((await Outfit.findById(outfit.id))?.name).toBe(outfit.name);
  });

  // Mocked behavior: Outfit.findOneAndUpdate finds nothing, as when the outfit is deleted
  // (e.g. from another device) after it was loaded but before the update is saved
  // Input: id of one of the user's outfits and a new name
  // Expected status code: 404
  // Expected behavior: nothing is updated
  // Expected output: { error: "Outfit not found" }
  test('Outfit deleted while updating', async () => {
    const { user, outfit } = await userWithOutfit();
    // The spy's type expects a Mongoose query, but the controller only awaits it, so a promise of null is enough.
    const findOneAndUpdate = jest.spyOn(Outfit, 'findOneAndUpdate').mockResolvedValue(null as never);

    const response = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Renamed' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Outfit not found' });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});

// Interface DELETE /outfits/:id
describe('Mocked: DELETE /outfits/:id', () => {
  // Mocked behavior: Outfit.findOneAndDelete throws a database error
  // Input: id of one of the user's outfits
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the outfit is not deleted
  // Expected output: { error: "Internal server error" }
  test('Outfit DB error', async () => {
    const { user, outfit } = await userWithOutfit();
    const findOneAndDelete = failOutfitCall('findOneAndDelete');

    const response = await request(app).delete(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOneAndDelete).toHaveBeenCalledTimes(1);
    expectInternalErrorLogged();
    expect(await Outfit.findById(outfit.id)).not.toBeNull();
  });
});
