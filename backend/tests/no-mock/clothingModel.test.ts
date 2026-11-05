import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createUser, UNKNOWN_ID } from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// File storage isn't configured in these tests, so everything here is checked before a model would
// be generated, stored or linked. The full flow is in tests/mock/clothingModel.test.ts.

// Interface POST /clothing/:id/generate
describe('Unmocked: POST /clothing/:id/generate', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).post(`/clothing/${UNKNOWN_ID}/generate`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid clothing item id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).post('/clothing/not-an-id/generate').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid clothing item id' });
  });

  // Input: id of one of the user's items while file storage isn't configured
  // Expected status code: 503
  // Expected behavior: no model is generated or stored; the item is unchanged
  // Expected output: { error: "File storage is not available" }
  test('Storage not configured', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app).post(`/clothing/${item.id}/generate`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'File storage is not available' });
    expect((await ClothingItem.findById(item.id))?.modelKey).toBeNull();
  });
});

// Interface GET /clothing/:id/model
describe('Unmocked: GET /clothing/:id/model', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).get(`/clothing/${UNKNOWN_ID}/model`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid clothing item id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).get('/clothing/not-an-id/model').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid clothing item id' });
  });

  // Input: valid id that doesn't exist, and the id of another user's item
  // Expected status code: 404
  // Expected behavior: the other user's item is not revealed
  // Expected output: { error: "Clothing item not found" }
  test.each(['unknown', 'another user'] as const)('Item not found: %s', async (kind) => {
    const user = await createUser();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);
    await ClothingItem.updateOne({ _id: otherItem.id }, { modelKey: 'garments/u/i/model.glb' });
    const id = kind === 'unknown' ? UNKNOWN_ID : otherItem.id;

    const response = await request(app).get(`/clothing/${id}/model`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Clothing item not found' });
  });

  // Input: id of one of the user's items that has no model yet
  // Expected status code: 404
  // Expected behavior: nothing is changed
  // Expected output: an error saying no model has been generated yet
  test('Item without a model', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app).get(`/clothing/${item.id}/model`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No 3D model has been generated for this item yet' });
  });

  // Input: id of one of the user's items that has a model, while file storage isn't configured
  // Expected status code: 503
  // Expected behavior: no link can be made
  // Expected output: { error: "File storage is not available" }
  test('Storage not configured', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: 'garments/u/i/model.glb' });

    const response = await request(app).get(`/clothing/${item.id}/model`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'File storage is not available' });
  });

  // Input: GET /clothing/:id for an item that has a model
  // Expected status code: 200
  // Expected behavior: the new /model route doesn't change the item route
  // Expected output: the item's details, without the model's storage key
  test('Item route does not expose the model key', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);
    await ClothingItem.updateOne({ _id: item.id }, { modelKey: 'garments/u/i/model.glb' });

    const response = await request(app).get(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: item.id });
    expect(response.body).not.toHaveProperty('modelKey');
  });
});
