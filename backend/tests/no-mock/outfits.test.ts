import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import { Outfit } from '../../src/models/outfit.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createOutfit, createUser, UNKNOWN_ID } from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

async function userWithCloset() {
  const user = await createUser();
  const shirt = await createClothingItem(user.id, { name: 'Shirt', category: 'top' });
  const jeans = await createClothingItem(user.id, { name: 'Jeans', category: 'bottom' });
  const shoes = await createClothingItem(user.id, { name: 'Sneakers', category: 'shoes' });
  return { user, shirt, jeans, shoes };
}

// Interface POST /outfits
describe('Unmocked: POST /outfits', () => {
  // Input: name, occasion and three of the user's items
  // Expected status code: 201
  // Expected behavior: outfit is saved as a manual outfit owned by the user
  // Expected output: the outfit with its items' details, in the order given
  test('Valid outfit', async () => {
    const { user, shirt, jeans, shoes } = await userWithCloset();

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: ' Date night ', occasion: 'dinner', items: [shoes.id, shirt.id, jeans.id] });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Date night', occasion: 'dinner', source: 'manual' });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['Sneakers', 'Shirt', 'Jeans']);
    const saved = await Outfit.findById(response.body.id);
    expect(saved?.owner.toString()).toBe(user.id);
  });

  // Input: name and items, no occasion
  // Expected status code: 201
  // Expected behavior: outfit is saved with an empty occasion
  // Expected output: the outfit with occasion ""
  test('Occasion is optional', async () => {
    const { user, shirt } = await userWithCloset();

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Basics', items: [shirt.id] });

    expect(response.status).toBe(201);
    expect(response.body.occasion).toBe('');
  });

  // Input: invalid outfit bodies (missing name, bad items, fields the client can't set)
  // Expected status code: 400
  // Expected behavior: no outfit is saved
  // Expected output: an error describing the problem
  test.each([
    [{ items: ['SHIRT'] }, /name must be a string/],
    [{ name: '', items: ['SHIRT'] }, /name must not be empty/],
    [{ name: 'Look' }, /items must be a non-empty array/],
    [{ name: 'Look', items: [] }, /items must be a non-empty array/],
    [{ name: 'Look', items: ['not-an-id'] }, /items must only contain valid ids/],
    [{ name: 'Look', items: ['SHIRT', 'SHIRT'] }, /items must not contain duplicates/],
    [{ name: 'Look', occasion: 5, items: ['SHIRT'] }, /occasion must be a string/],
    [{ name: 'Look', items: ['SHIRT'], source: 'ai' }, /Unknown field: source/],
  ])('Invalid body %j', async (body, expectedError) => {
    const { user, shirt } = await userWithCloset();
    const resolved = JSON.parse(JSON.stringify(body).replaceAll('SHIRT', shirt.id));

    const response = await request(app).post('/outfits').set('Authorization', authHeader(user.id)).send(resolved);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Input: more than 20 items
  // Expected status code: 400
  // Expected behavior: no outfit is saved
  // Expected output: error about the item limit
  test('Too many items', async () => {
    const user = await createUser();
    const ids = Array.from({ length: 21 }, (_, i) => i.toString(16).padStart(24, '0'));

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Everything', items: ids });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/at most 20/);
  });

  // Input: one of the user's items plus another user's item
  // Expected status code: 400
  // Expected behavior: no outfit is saved
  // Expected output: { error: "All items must be clothing items in your closet" }
  test("Includes another user's item", async () => {
    const { user, shirt } = await userWithCloset();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Look', items: [shirt.id, otherItem.id] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'All items must be clothing items in your closet' });
    expect(await Outfit.countDocuments()).toBe(0);
  });

  // Input: an item id that doesn't exist
  // Expected status code: 400
  // Expected behavior: no outfit is saved
  // Expected output: { error: "All items must be clothing items in your closet" }
  test('Includes an unknown item', async () => {
    const { user } = await userWithCloset();

    const response = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Look', items: [UNKNOWN_ID] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'All items must be clothing items in your closet' });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).post('/outfits').send({ name: 'Look', items: [UNKNOWN_ID] });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });
});

// Interface GET /outfits
describe('Unmocked: GET /outfits', () => {
  // Input: signed-in user with two outfits; another user also has an outfit
  // Expected status code: 200
  // Expected behavior: only the user's outfits are returned, newest first
  // Expected output: { outfits: [...] } with each outfit's items
  test('Returns only own outfits, newest first', async () => {
    const { user, shirt, jeans } = await userWithCloset();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);
    await createOutfit(user.id, [shirt.id], 'First');
    await createOutfit(user.id, [shirt.id, jeans.id], 'Second');
    await createOutfit(otherUser.id, [otherItem.id], 'Not mine');

    const response = await request(app).get('/outfits').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.outfits.map((outfit: { name: string }) => outfit.name)).toEqual(['Second', 'First']);
    expect(response.body.outfits[0].items.map((item: { name: string }) => item.name)).toEqual(['Shirt', 'Jeans']);
  });

  // Input: signed-in user with no outfits
  // Expected status code: 200
  // Expected behavior: nothing is changed
  // Expected output: { outfits: [] }
  test('No outfits', async () => {
    const user = await createUser();

    const response = await request(app).get('/outfits').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outfits: [] });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).get('/outfits');

    expect(response.status).toBe(401);
  });
});

// Interface GET /outfits/:id
describe('Unmocked: GET /outfits/:id', () => {
  // Input: id of one of the user's outfits
  // Expected status code: 200
  // Expected behavior: nothing is changed
  // Expected output: the outfit with its items' details
  test('Own outfit', async () => {
    const { user, shirt, jeans } = await userWithCloset();
    const outfit = await createOutfit(user.id, [shirt.id, jeans.id]);

    const response = await request(app).get(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: outfit.id, name: 'Weekend look', occasion: '', source: 'manual' });
    expect(response.body.items).toHaveLength(2);
  });

  // Input: id of an outfit that still references a clothing item that no longer exists
  // Expected status code: 200
  // Expected behavior: the missing item is left out instead of failing the request
  // Expected output: the outfit with only its existing items
  test('Outfit referencing a missing item', async () => {
    const { user, shirt, jeans } = await userWithCloset();
    const outfit = await createOutfit(user.id, [shirt.id, jeans.id]);
    await ClothingItem.deleteOne({ _id: jeans.id });

    const response = await request(app).get(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['Shirt']);
  });

  // Input: id of another user's outfit
  // Expected status code: 404
  // Expected behavior: the other user's outfit is not revealed
  // Expected output: { error: "Outfit not found" }
  test("Another user's outfit", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);
    const outfit = await createOutfit(otherUser.id, [otherItem.id]);

    const response = await request(app).get(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Outfit not found' });
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid outfit id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).get('/outfits/abc').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid outfit id' });
  });
});

// Interface PATCH /outfits/:id
describe('Unmocked: PATCH /outfits/:id', () => {
  // Input: new name, occasion and item list (all the user's items)
  // Expected status code: 200
  // Expected behavior: outfit is updated in the database
  // Expected output: the updated outfit
  test('Valid update', async () => {
    const { user, shirt, jeans, shoes } = await userWithCloset();
    const outfit = await createOutfit(user.id, [shirt.id]);

    const response = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Office', occasion: 'work', items: [jeans.id, shoes.id] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Office', occasion: 'work' });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['Jeans', 'Sneakers']);
    const saved = await Outfit.findById(outfit.id);
    expect(saved?.items.map((id) => id.toString())).toEqual([jeans.id, shoes.id]);
  });

  // Input: items list containing another user's item
  // Expected status code: 400
  // Expected behavior: outfit is unchanged
  // Expected output: { error: "All items must be clothing items in your closet" }
  test("Includes another user's item", async () => {
    const { user, shirt } = await userWithCloset();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);
    const outfit = await createOutfit(user.id, [shirt.id]);

    const response = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ items: [otherItem.id] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'All items must be clothing items in your closet' });
    const saved = await Outfit.findById(outfit.id);
    expect(saved?.items.map((id) => id.toString())).toEqual([shirt.id]);
  });

  // Input: empty object
  // Expected status code: 400
  // Expected behavior: outfit is unchanged
  // Expected output: error asking for at least one field
  test('Empty body', async () => {
    const { user, shirt } = await userWithCloset();
    const outfit = await createOutfit(user.id, [shirt.id]);

    const response = await request(app).patch(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id)).send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Provide at least one of/);
  });

  // Input: invalid values for each editable field, or a body that isn't an object
  // Expected status code: 400
  // Expected behavior: outfit is unchanged
  // Expected output: an error describing the problem
  test.each([
    [{ name: '' }, /name must not be empty/],
    [{ occasion: 'x'.repeat(101) }, /occasion must be at most 100 characters/],
    [{ items: [] }, /items must be a non-empty array/],
    [{ items: ['nope'] }, /items must only contain valid ids/],
    [{ source: 'ai' }, /Unknown field: source/],
    [['not', 'an', 'object'], /Request body must be a JSON object/],
  ])('Invalid body %j', async (body, expectedError) => {
    const { user, shirt } = await userWithCloset();
    const outfit = await createOutfit(user.id, [shirt.id]);

    const response = await request(app).patch(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id)).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    const saved = await Outfit.findById(outfit.id);
    expect(saved?.name).toBe('Weekend look');
    expect(saved?.items.map((id) => id.toString())).toEqual([shirt.id]);
  });

  // Input: id of another user's outfit
  // Expected status code: 404
  // Expected behavior: the other user's outfit is unchanged
  // Expected output: { error: "Outfit not found" }
  test("Another user's outfit", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);
    const outfit = await createOutfit(otherUser.id, [otherItem.id]);

    const response = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Mine now' });

    expect(response.status).toBe(404);
    const saved = await Outfit.findById(outfit.id);
    expect(saved?.name).toBe('Weekend look');
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid outfit id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).patch('/outfits/abc').set('Authorization', authHeader(user.id)).send({ name: 'x' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid outfit id' });
  });
});

// Interface DELETE /outfits/:id
describe('Unmocked: DELETE /outfits/:id', () => {
  // Input: id of one of the user's outfits
  // Expected status code: 204
  // Expected behavior: outfit is deleted; its clothing items are kept
  // Expected output: empty body
  test('Own outfit', async () => {
    const { user, shirt } = await userWithCloset();
    const outfit = await createOutfit(user.id, [shirt.id]);

    const response = await request(app).delete(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(await Outfit.findById(outfit.id)).toBeNull();
    expect(await ClothingItem.findById(shirt.id)).not.toBeNull();
  });

  // Input: id of another user's outfit
  // Expected status code: 404
  // Expected behavior: the other user's outfit is not deleted
  // Expected output: { error: "Outfit not found" }
  test("Another user's outfit", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const otherItem = await createClothingItem(otherUser.id);
    const outfit = await createOutfit(otherUser.id, [otherItem.id]);

    const response = await request(app).delete(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(await Outfit.findById(outfit.id)).not.toBeNull();
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid outfit id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).delete('/outfits/abc').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid outfit id' });
  });
});
