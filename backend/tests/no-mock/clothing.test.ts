import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
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

// Interface GET /clothing
describe('Unmocked: GET /clothing', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).get('/clothing');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });

  // Input: signed-in user with no clothing items
  // Expected status code: 200
  // Expected behavior: nothing is changed
  // Expected output: { items: [] }
  test('Empty closet', async () => {
    const user = await createUser();

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  // Input: signed-in user with two items; another user also has an item
  // Expected status code: 200
  // Expected behavior: only the user's own items are returned, newest first
  // Expected output: the user's two items, without internal fields (owner, imageKey)
  test('Returns only own items, newest first', async () => {
    const user = await createUser();
    const otherUser = await createUser();
    await createClothingItem(user.id, { name: 'Old shirt' });
    await createClothingItem(user.id, { name: 'New jeans', category: 'bottom' });
    await createClothingItem(otherUser.id, { name: 'Not mine' });

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['New jeans', 'Old shirt']);
    expect(Object.keys(response.body.items[0]).sort()).toEqual(
      ['category', 'color', 'createdAt', 'id', 'isArchived', 'isClean', 'name', 'style', 'tags', 'updatedAt'].sort()
    );
  });

  // Input: signed-in user with one active and one archived item
  // Expected status code: 200
  // Expected behavior: archived items are not part of the closet
  // Expected output: only the active item
  test('Leaves out archived items', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { name: 'Current shirt' });
    await createClothingItem(user.id, { name: 'Old shirt', isArchived: true });

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['Current shirt']);
  });

  // Input: ?category=top
  // Expected status code: 200
  // Expected behavior: only items in that category are returned
  // Expected output: the user's tops
  test('Filters by category', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { name: 'Shirt', category: 'top' });
    await createClothingItem(user.id, { name: 'Jeans', category: 'bottom' });

    const response = await request(app).get('/clothing?category=top').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe('Shirt');
  });

  // Input: ?clean=false
  // Expected status code: 200
  // Expected behavior: only items marked as not clean are returned
  // Expected output: the user's dirty items
  test('Filters by clean status', async () => {
    const user = await createUser();
    await createClothingItem(user.id, { name: 'Clean shirt', isClean: true });
    await createClothingItem(user.id, { name: 'Dirty shirt', isClean: false });

    const response = await request(app).get('/clothing?clean=false').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe('Dirty shirt');
  });

  // Input: ?category=hats (not a valid category)
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: error listing the valid categories
  test('Invalid category filter', async () => {
    const user = await createUser();

    const response = await request(app).get('/clothing?category=hats').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/category must be one of/);
  });

  // Input: ?clean=maybe
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "clean must be true or false" }
  test('Invalid clean filter', async () => {
    const user = await createUser();

    const response = await request(app).get('/clothing?clean=maybe').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'clean must be true or false' });
  });
});

// Interface GET /clothing/:id
describe('Unmocked: GET /clothing/:id', () => {
  // Input: id of one of the user's items
  // Expected status code: 200
  // Expected behavior: nothing is changed
  // Expected output: the item's details
  test('Own item', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id, { name: 'Wool coat', category: 'outerwear', tags: ['winter'] });

    const response = await request(app).get(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: item.id,
      name: 'Wool coat',
      category: 'outerwear',
      color: 'blue',
      style: 'casual',
      tags: ['winter'],
      isClean: true,
      isArchived: false,
    });
  });

  // Input: id of one of the user's archived items (e.g. opened from a past outfit)
  // Expected status code: 200
  // Expected behavior: nothing is changed
  // Expected output: the item's details, marked as archived
  test('Archived item', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id, { isArchived: true });

    const response = await request(app).get(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: item.id, isArchived: true });
  });

  // Input: id of another user's item
  // Expected status code: 404
  // Expected behavior: the other user's item is not revealed
  // Expected output: { error: "Clothing item not found" }
  test("Another user's item", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const item = await createClothingItem(otherUser.id);

    const response = await request(app).get(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Clothing item not found' });
  });

  // Input: valid id that doesn't exist
  // Expected status code: 404
  // Expected behavior: nothing is changed
  // Expected output: { error: "Clothing item not found" }
  test('Unknown item', async () => {
    const user = await createUser();

    const response = await request(app).get(`/clothing/${UNKNOWN_ID}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Clothing item not found' });
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid clothing item id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).get('/clothing/not-an-id').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid clothing item id' });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).get(`/clothing/${UNKNOWN_ID}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });
});

// Interface PATCH /clothing/:id
describe('Unmocked: PATCH /clothing/:id', () => {
  // Input: new name, category, tags (with spaces and a duplicate) and clean status
  // Expected status code: 200
  // Expected behavior: item is updated in the database; tags are trimmed and de-duplicated
  // Expected output: the updated item
  test('Valid update', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: '  Linen shirt ', category: 'top', tags: ['summer', ' summer ', 'work'], isClean: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Linen shirt', tags: ['summer', 'work'], isClean: false });
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.name).toBe('Linen shirt');
    expect(saved?.isClean).toBe(false);
    expect(saved?.color).toBe('blue');
  });

  // Input: new color and style only
  // Expected status code: 200
  // Expected behavior: only color and style change; other fields are kept
  // Expected output: the updated item
  test('Partial update of color and style', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id, { tags: ['work'] });

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ color: 'olive green', style: 'formal' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Blue shirt', color: 'olive green', style: 'formal', tags: ['work'] });
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.color).toBe('olive green');
    expect(saved?.style).toBe('formal');
  });

  // Input: empty object
  // Expected status code: 400
  // Expected behavior: item is unchanged
  // Expected output: error asking for at least one field
  test('Empty body', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app).patch(`/clothing/${item.id}`).set('Authorization', authHeader(user.id)).send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Provide at least one of/);
  });

  // Input: field that can't be edited (owner)
  // Expected status code: 400
  // Expected behavior: item is unchanged
  // Expected output: { error: "Unknown field: owner" }
  test('Unknown field', async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ owner: otherUser.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Unknown field: owner' });
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.owner.toString()).toBe(user.id);
  });

  // Input: invalid values for each editable field
  // Expected status code: 400
  // Expected behavior: item is unchanged
  // Expected output: an error describing the invalid field
  test.each([
    [{ category: 'hats' }, /category must be one of/],
    [{ name: '   ' }, /name must not be empty/],
    [{ name: 'x'.repeat(101) }, /name must be at most 100 characters/],
    [{ color: 42 }, /color must be a string/],
    [{ style: '' }, /style must not be empty/],
    [{ tags: 'summer' }, /tags must be an array/],
    [{ tags: [''] }, /each tag must not be empty/],
    [{ tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) }, /tags must contain at most 20/],
    [{ isClean: 'yes' }, /isClean must be true or false/],
    [['not', 'an', 'object'], /Request body must be a JSON object/],
  ])('Invalid value %j', async (body, expectedError) => {
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app).patch(`/clothing/${item.id}`).set('Authorization', authHeader(user.id)).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.name).toBe('Blue shirt');
  });

  // Input: body that isn't valid JSON
  // Expected status code: 400
  // Expected behavior: request is rejected before reaching the handler
  // Expected output: a JSON error
  test('Malformed JSON', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id);

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  // Input: id of one of the user's archived items
  // Expected status code: 409
  // Expected behavior: archived items can't be edited; item is unchanged
  // Expected output: { error: "Clothing item is archived and can no longer be edited" }
  test('Archived item', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id, { isArchived: true });

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Renamed' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Clothing item is archived and can no longer be edited' });
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.name).toBe('Blue shirt');
  });

  // Input: id of another user's item
  // Expected status code: 404
  // Expected behavior: the other user's item is unchanged
  // Expected output: { error: "Clothing item not found" }
  test("Another user's item", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const item = await createClothingItem(otherUser.id);

    const response = await request(app)
      .patch(`/clothing/${item.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Stolen' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Clothing item not found' });
    const saved = await ClothingItem.findById(item.id);
    expect(saved?.name).toBe('Blue shirt');
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid clothing item id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).patch('/clothing/123').set('Authorization', authHeader(user.id)).send({ name: 'x' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid clothing item id' });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).patch(`/clothing/${UNKNOWN_ID}`).send({ name: 'x' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });
});

// Interface DELETE /clothing/:id
describe('Unmocked: DELETE /clothing/:id', () => {
  // Input: id of one of the user's items that is used in an outfit
  // Expected status code: 204
  // Expected behavior: item is archived, not deleted: it leaves the closet but the outfit still shows it
  // Expected output: empty body
  test('Own item used in an outfit', async () => {
    const user = await createUser();
    const shirt = await createClothingItem(user.id);
    const jeans = await createClothingItem(user.id, { name: 'Jeans', category: 'bottom' });
    const outfit = await createOutfit(user.id, [shirt.id, jeans.id]);

    const response = await request(app).delete(`/clothing/${shirt.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    const saved = await ClothingItem.findById(shirt.id);
    expect(saved?.isArchived).toBe(true);
    expect(saved?.archivedAt).toBeInstanceOf(Date);
    const closet = await request(app).get('/clothing').set('Authorization', authHeader(user.id));
    expect(closet.body.items.map((item: { name: string }) => item.name)).toEqual(['Jeans']);
    const savedOutfit = await request(app).get(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));
    expect(savedOutfit.body.items.map((item: { name: string; isArchived: boolean }) => [item.name, item.isArchived])).toEqual([
      ['Blue shirt', true],
      ['Jeans', false],
    ]);
  });

  // Input: id of an item that is already archived
  // Expected status code: 404
  // Expected behavior: nothing is changed
  // Expected output: { error: "Clothing item not found" }
  test('Already archived item', async () => {
    const user = await createUser();
    const item = await createClothingItem(user.id, { isArchived: true });

    const response = await request(app).delete(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Clothing item not found' });
  });

  // Input: id of another user's item
  // Expected status code: 404
  // Expected behavior: the other user's item is not deleted
  // Expected output: { error: "Clothing item not found" }
  test("Another user's item", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const item = await createClothingItem(otherUser.id);

    const response = await request(app).delete(`/clothing/${item.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Clothing item not found' });
    expect(await ClothingItem.findById(item.id)).not.toBeNull();
  });

  // Input: malformed id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid clothing item id" }
  test('Invalid id', async () => {
    const user = await createUser();

    const response = await request(app).delete('/clothing/not-an-id').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid clothing item id' });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).delete(`/clothing/${UNKNOWN_ID}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });
});
