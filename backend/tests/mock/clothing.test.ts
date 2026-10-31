import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

const app = createApp();

const INTERNAL_ERROR = { error: 'Internal server error' };

// Makes a Clothing DB call throw, like a lost database connection would.
function failDatabaseCall(method: 'find' | 'findOne' | 'findOneAndUpdate' | 'exists') {
  return jest.spyOn(ClothingItem, method).mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setFileStorage(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface GET /clothing
describe('Mocked: GET /clothing', () => {
  // Mocked behavior: file storage (Azure Blob Storage) can't create a download link
  // Input: signed-in user with one item
  // Expected status code: 200
  // Expected behavior: the closet still loads; the item just has no photo link
  // Expected output: the item with imageUrl null
  test('Closet loads without photo links when storage fails', async () => {
    const getDownloadUrl = jest.fn<FileStorage['getDownloadUrl']>().mockRejectedValue(new Error('Forced signing error'));
    setFileStorage({ getDownloadUrl } as unknown as FileStorage);
    const user = await createUser();
    await createClothingItem(user.id);

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].imageUrl).toBeNull();
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  // Mocked behavior: ClothingItem.find throws a database error
  // Input: signed-in user with one item
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no internal details are sent to the client
  // Expected output: { error: "Internal server error" }
  test('Database error', async () => {
    const user = await createUser();
    await createClothingItem(user.id);
    const find = failDatabaseCall('find');

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(find).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });
});

// Interface GET /clothing/:id
describe('Mocked: GET /clothing/:id', () => {
  // Mocked behavior: ClothingItem.findOne throws a database error
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; no internal details are sent to the client
  // Expected output: { error: "Internal server error" }
  test('Database error', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);
    const findOne = failDatabaseCall('findOne');

    const response = await request(app).get(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });
});

// Interface PATCH /clothing/:id
describe('Mocked: PATCH /clothing/:id', () => {
  // Mocked behavior: ClothingItem.findOneAndUpdate throws a database error
  // Input: id of one of the user's items and a new name
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the item is unchanged
  // Expected output: { error: "Internal server error" }
  test('Database error while saving', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);
    const findOneAndUpdate = failDatabaseCall('findOneAndUpdate');

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Renamed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    findOneAndUpdate.mockRestore();
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.name).toBe('Blue shirt');
  });

  // Mocked behavior: ClothingItem.exists throws while checking whether the item is archived
  // Input: id of one of the user's archived items and a new name
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the item is unchanged
  // Expected output: { error: "Internal server error" }
  test('Database error while checking for an archived item', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id, { isArchived: true });
    const exists = failDatabaseCall('exists');

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Renamed' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(exists).toHaveBeenCalledTimes(1);
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.name).toBe('Blue shirt');
  });
});

// Interface DELETE /clothing/:id
describe('Mocked: DELETE /clothing/:id', () => {
  // Mocked behavior: ClothingItem.findOneAndUpdate throws a database error
  // Input: id of one of the user's items
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the item stays in the closet (not archived)
  // Expected output: { error: "Internal server error" }
  test('Database error', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);
    const findOneAndUpdate = failDatabaseCall('findOneAndUpdate');

    const response = await request(app).delete(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    findOneAndUpdate.mockRestore();
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.isArchived).toBe(false);
  });
});
