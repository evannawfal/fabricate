import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import { Outfit } from '../../src/models/outfit.js';
import { POST_VISIBLE_HOURS, Post } from '../../src/models/post.js';
import { User } from '../../src/models/user.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import {
  authHeader,
  createClothingItem,
  createOutfit,
  createUser,
  makeFriends,
  UNKNOWN_ID,
} from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

const HOUR_MS = 60 * 60 * 1000;

async function createUserWithOutfit(name = 'Weekend look') {
  const user = await createUser();
  const top = await createClothingItem(user.id, { name: 'White tee' });
  const bottom = await createClothingItem(user.id, { name: 'Black jeans', category: 'bottom' });
  const outfit = await createOutfit(user.id, [top.id, bottom.id], name);
  return { user, outfit };
}

function postOutfit(userId: string, outfitId: string) {
  return request(app).post('/posts').set('Authorization', authHeader(userId)).send({ outfitId });
}

function listPosts(userId: string) {
  return request(app).get('/posts').set('Authorization', authHeader(userId));
}

// Interface POST /posts
describe('Unmocked: POST /posts', () => {
  // Input: the id of one of the user's outfits
  // Expected status code: 201
  // Expected behavior: the post is saved with a copy of the outfit's name and items
  // Expected output: the post, with the author, the outfit's items in order and isOwn true
  test("Posts one of the user's outfits", async () => {
    const { user, outfit } = await createUserWithOutfit();

    const response = await postOutfit(user.id, outfit.id);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      author: { id: user.id, name: 'Test ' + user.familyName },
      isOwn: true,
      outfitId: outfit.id,
      name: 'Weekend look',
    });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(['White tee', 'Black jeans']);
    expect(Date.parse(response.body.postedAt)).toBeGreaterThan(Date.now() - HOUR_MS);
    expect(await Post.countDocuments({ author: user.id })).toBe(1);
  });

  // Input: a second outfit posted after the first
  // Expected status code: 201
  // Expected behavior: the second post replaces the first, so the user still has one post
  // Expected output: the new post
  test('Posting again replaces the previous post', async () => {
    const { user, outfit } = await createUserWithOutfit();
    const item = await createClothingItem(user.id, { name: 'Grey hoodie' });
    const second = await createOutfit(user.id, [item.id], 'Cozy');
    await postOutfit(user.id, outfit.id);

    const response = await postOutfit(user.id, second.id);

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Cozy');
    const posts = await Post.find({ author: user.id });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.outfit.toString()).toBe(second.id);
  });

  // Input: invalid bodies
  // Expected status code: 400
  // Expected behavior: nothing is posted
  // Expected output: an error describing the problem
  test.each([
    ['a non-object body', ['x'], 'Request body must be a JSON object'],
    ['an unknown field', { outfitId: UNKNOWN_ID, caption: 'hi' }, 'Unknown field: caption'],
    ['no outfitId', {}, 'outfitId must be a valid id'],
    ['an invalid outfitId', { outfitId: 'abc' }, 'outfitId must be a valid id'],
  ])('Rejects %s', async (_case, body, error) => {
    const user = await createUser();

    const response = await request(app).post('/posts').set('Authorization', authHeader(user.id)).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: another user's outfit, and an outfit id that doesn't exist
  // Expected status code: 404
  // Expected behavior: nothing is posted
  // Expected output: { error: "Outfit not found" }
  test("Rejects an outfit that isn't the user's", async () => {
    const user = await createUser();
    const { outfit: othersOutfit } = await createUserWithOutfit();

    for (const outfitId of [othersOutfit.id, UNKNOWN_ID]) {
      const response = await postOutfit(user.id, outfitId);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Outfit not found' });
    }
    expect(await Post.countDocuments()).toBe(0);
  });
});

// Interface GET /posts
describe('Unmocked: GET /posts', () => {
  // Input: a user who posted, two friends who posted, and a non-friend who posted
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the user's and friends' posts, newest first, with isOwn set only on the user's post
  test("Lists the user's and friends' posts, newest first", async () => {
    const { user, outfit } = await createUserWithOutfit('Mine');
    const amy = await createUserWithOutfit('Amy look');
    const zoe = await createUserWithOutfit('Zoe look');
    const stranger = await createUserWithOutfit('Stranger look');
    await makeFriends(user.id, amy.user.id, zoe.user.id);
    for (const { user: author, outfit: posted } of [amy, { user, outfit }, zoe, stranger]) {
      await postOutfit(author.id, posted.id);
    }

    const response = await listPosts(user.id);

    expect(response.status).toBe(200);
    expect(response.body.posts.map((post: { name: string; isOwn: boolean }) => [post.name, post.isOwn])).toEqual([
      ['Zoe look', false],
      ['Mine', true],
      ['Amy look', false],
    ]);
    expect(response.body.posts[0]).toMatchObject({ author: { id: zoe.user.id }, outfitId: zoe.outfit.id });
    expect(response.body.posts[0].items).toHaveLength(2);
  });

  // Input: a friend's post from just over a day ago
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { posts: [] }
  test('Leaves out posts older than a day', async () => {
    const user = await createUser();
    const friend = await createUserWithOutfit();
    await makeFriends(user.id, friend.user.id);
    await Post.create({
      author: friend.user.id,
      outfit: friend.outfit.id,
      name: friend.outfit.name,
      items: friend.outfit.items,
      postedAt: new Date(Date.now() - (POST_VISIBLE_HOURS + 1) * HOUR_MS),
    });

    const response = await listPosts(user.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ posts: [] });
  });

  // Input: a friend posts an outfit, then renames it and deletes it
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the post still shows the outfit as it was posted
  test('Keeps showing a post after its outfit is edited or deleted', async () => {
    const user = await createUser();
    const friend = await createUserWithOutfit();
    await makeFriends(user.id, friend.user.id);
    await postOutfit(friend.user.id, friend.outfit.id);
    await Outfit.updateOne({ _id: friend.outfit.id }, { $set: { name: 'Renamed', items: [] } });

    const afterEdit = await listPosts(user.id);
    await Outfit.deleteOne({ _id: friend.outfit.id });
    const afterDelete = await listPosts(user.id);

    for (const response of [afterEdit, afterDelete]) {
      expect(response.body.posts).toHaveLength(1);
      expect(response.body.posts[0].name).toBe('Weekend look');
      expect(response.body.posts[0].items).toHaveLength(2);
    }
  });

  // Input: a friend's post whose author account and one item no longer exist in the database
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the post with the author shown as "Unknown user" and the missing item left out
  test('Post whose author or item no longer exists', async () => {
    const user = await createUser();
    const friend = await createUserWithOutfit();
    await makeFriends(user.id, friend.user.id);
    await postOutfit(friend.user.id, friend.outfit.id);
    await User.deleteOne({ _id: friend.user.id });
    await ClothingItem.deleteOne({ _id: friend.outfit.items[0] });

    const response = await listPosts(user.id);

    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0].author).toEqual({ id: friend.user.id, name: 'Unknown user' });
    expect(response.body.posts[0].items.map((item: { name: string }) => item.name)).toEqual(['Black jeans']);
  });

  // Input: a user with no friends and no post
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: { posts: [] }
  test('No posts', async () => {
    const user = await createUser();

    const response = await listPosts(user.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ posts: [] });
  });
});

// Interface DELETE /posts/:id
describe('Unmocked: DELETE /posts/:id', () => {
  // Input: the id of the user's own post
  // Expected status code: 204
  // Expected behavior: the post is deleted
  // Expected output: empty body
  test("Deletes the user's own post", async () => {
    const { user, outfit } = await createUserWithOutfit();
    const posted = await postOutfit(user.id, outfit.id);

    const response = await request(app).delete(`/posts/${posted.body.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: the id of a friend's post
  // Expected status code: 403
  // Expected behavior: the post is kept
  // Expected output: { error: "You can only delete your own post" }
  test("Can't delete a friend's post", async () => {
    const user = await createUser();
    const friend = await createUserWithOutfit();
    await makeFriends(user.id, friend.user.id);
    const posted = await postOutfit(friend.user.id, friend.outfit.id);

    const response = await request(app).delete(`/posts/${posted.body.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'You can only delete your own post' });
    expect(await Post.countDocuments()).toBe(1);
  });

  // Input: an id that matches no post, and one that isn't a valid id
  // Expected status code: 404 and 400
  // Expected behavior: nothing changes
  // Expected output: { error: "Post not found" } and { error: "Invalid post id" }
  test.each([
    [UNKNOWN_ID, 404, 'Post not found'],
    ['not-an-id', 400, 'Invalid post id'],
  ])('Rejects post id %s', async (id, status, error) => {
    const user = await createUser();

    const response = await request(app).delete(`/posts/${id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
  });
});

// Interfaces POST /posts, GET /posts and DELETE /posts/:id
describe('Unmocked: post endpoints without sign-in', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: the request is rejected before the handler runs
  // Expected output: { error: "Missing token" }
  test.each([
    ['post', '/posts'],
    ['get', '/posts'],
    ['delete', `/posts/${UNKNOWN_ID}`],
  ] as const)('%s %s requires sign-in', async (method, path) => {
    const response = await request(app)[method](path).send({ outfitId: UNKNOWN_ID });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });
});
