import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import { Outfit } from '../../src/models/outfit.js';
import { Post } from '../../src/models/post.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createClothingItem, createOutfit, createUser } from '../helpers/fixtures.js';

const app = createApp();

function failCall(model: typeof Post | typeof Outfit | typeof User | typeof ClothingItem, method: string) {
  return jest.spyOn(model as typeof Post, method as 'find').mockImplementation(() => {
    throw new Error('Forced database error');
  });
}

function expectInternalError(response: request.Response) {
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: 'Internal server error' });
  expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
}

async function createPostedOutfit() {
  const user = await createUser();
  const item = await createClothingItem(user.id);
  const outfit = await createOutfit(user.id, [item.id]);
  const post = await Post.create({ author: user.id, outfit: outfit.id, name: outfit.name, items: outfit.items, postedAt: new Date() });
  return { user, outfit, post };
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
// Silences the error handler's log of each forced 500; the spy lets tests check it was logged.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /posts
describe('Mocked: POST /posts', () => {
  // Mocked behavior: Outfit.findOne throws while checking the outfit, or Post.findOneAndUpdate while saving
  // Input: one of the user's outfits
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; nothing is posted
  // Expected output: { error: "Internal server error" }
  test.each([
    ['Outfit DB error while checking the outfit', Outfit, 'findOne'],
    ['Post DB error while saving', Post, 'findOneAndUpdate'],
  ] as const)('%s', async (_case, model, method) => {
    const user = await createUser();
    const item = await createClothingItem(user.id);
    const outfit = await createOutfit(user.id, [item.id]);
    failCall(model, method);

    const response = await request(app).post('/posts').set('Authorization', authHeader(user.id)).send({ outfitId: outfit.id });

    expectInternalError(response);
    jest.restoreAllMocks();
    expect(await Post.countDocuments()).toBe(0);
  });
});

// Interface GET /posts
describe('Mocked: GET /posts', () => {
  // Mocked behavior: User.findById throws while loading friends, Post.find while loading posts,
  // User.find while loading the authors, or ClothingItem.find while loading the items
  // Input: a user with a post
  // Expected status code: 500
  // Expected behavior: the error is handled and logged
  // Expected output: { error: "Internal server error" }
  test.each([
    ['User DB error while loading friends', User, 'findById'],
    ['Post DB error while loading posts', Post, 'find'],
    ['User DB error while loading authors', User, 'find'],
    ['Clothing DB error while loading items', ClothingItem, 'find'],
  ] as const)('%s', async (_case, model, method) => {
    const { user } = await createPostedOutfit();
    failCall(model, method);

    expectInternalError(await request(app).get('/posts').set('Authorization', authHeader(user.id)));
  });
});

// Interface DELETE /posts/:id
describe('Mocked: DELETE /posts/:id', () => {
  // Mocked behavior: Post.findById throws while loading the post, or Post.deleteOne while deleting it
  // Input: the id of the user's own post
  // Expected status code: 500
  // Expected behavior: the error is handled and logged; the post is kept
  // Expected output: { error: "Internal server error" }
  test.each([
    ['Post DB error while loading the post', 'findById'],
    ['Post DB error while deleting', 'deleteOne'],
  ] as const)('%s', async (_case, method) => {
    const { user, post } = await createPostedOutfit();
    failCall(Post, method);

    const response = await request(app).delete(`/posts/${post.id}`).set('Authorization', authHeader(user.id));

    expectInternalError(response);
    jest.restoreAllMocks();
    expect(await Post.countDocuments()).toBe(1);
  });
});
