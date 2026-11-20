import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { Post } from '../../src/models/posts.js';
import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createPost, createUser, makeFriends } from '../helpers/fixtures.js';

const app = createApp();

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const KEY_PATTERN = /^posts\/[0-9a-f]{24}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const INTERNAL_ERROR = { error: 'Internal server error' };

function mockStorage(options: { uploadError?: Error; deleteError?: Error; signError?: Error } = {}) {
  const storage = {
    uploadFile: jest.fn<FileStorage['uploadFile']>(() =>
      options.uploadError ? Promise.reject(options.uploadError) : Promise.resolve()
    ),
    downloadFile: jest.fn<FileStorage['downloadFile']>(() => Promise.resolve(new Uint8Array())),
    getDownloadUrl: jest.fn<FileStorage['getDownloadUrl']>((key) =>
      options.signError ? Promise.reject(options.signError) : Promise.resolve(`https://storage.test/${key}?sig=test`)
    ),
    deleteFile: jest.fn<FileStorage['deleteFile']>(() =>
      options.deleteError ? Promise.reject(options.deleteError) : Promise.resolve()
    ),
  };
  setFileStorage(storage);
  return storage;
}

function uploadPost(
  userId: string,
  options: { contentType?: string; caption?: string; tzOffsetMinutes?: string } = {}
) {
  const contentType = options.contentType ?? 'image/jpeg';
  const ext = contentType.split('/')[1] ?? 'jpg';
  const req = request(app)
    .post('/posts')
    .set('Authorization', authHeader(userId))
    .attach('photo', JPEG, { filename: `ootd.${ext}`, contentType });
  if (options.caption !== undefined) req.field('caption', options.caption);
  if (options.tzOffsetMinutes !== undefined) req.field('tzOffsetMinutes', options.tzOffsetMinutes);
  return req;
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

// Interface POST /posts
describe('Mocked: POST /posts', () => {
  // Mocked behavior: storage accepts the upload and signs a download link
  // Input: a JPEG photo, trimmed caption, and PST timezone offset (-480)
  // Expected status code: 201
  // Expected behavior: photo is stored under posts/<userId>/, expiresAt is next local midnight, and post is saved
  // Expected output: PostResponse with signed imageUrl, likeCount 0, likedByMe false
  test('Uploads photo, sets local midnight expiry, and saves post', async () => {
    const storage = mockStorage();
    const user = await createUser();

    const response = await uploadPost(user.id, {
      caption: '  Rainy campus fit  ',
      tzOffsetMinutes: '-480',
    });

    expect(response.status).toBe(201);
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = storage.uploadFile.mock.calls[0] ?? [];
    expect(key).toMatch(KEY_PATTERN);
    expect(key?.startsWith(`posts/${user.id}/`)).toBe(true);
    expect(Buffer.from(body as Uint8Array).equals(JPEG)).toBe(true);
    expect(contentType).toBe('image/jpeg');

    expect(response.body).toMatchObject({
      authorId: user.id,
      authorName: `Test ${user.familyName}`,
      imageUrl: `https://storage.test/${key}?sig=test`,
      caption: 'Rainy campus fit',
      likeCount: 0,
      likedByMe: false,
    });

    const expiresAt = new Date(response.body.expiresAt as string);
    // -480 minutes = UTC-8, so local midnight (00:00 PST) is 08:00:00.000 UTC
    expect(expiresAt.getUTCHours()).toBe(8);
    expect(expiresAt.getUTCMinutes()).toBe(0);
    expect(expiresAt.getUTCSeconds()).toBe(0);
    expect(expiresAt.getUTCMilliseconds()).toBe(0);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // Mocked behavior: storage accepts the upload
  // Input: a JPEG photo with tzOffsetMinutes "abc" (not a number) and "900" (beyond UTC+14)
  // Expected status code: 201
  // Expected behavior: the offset is ignored and the post expires at the next UTC midnight
  // Expected output: PostResponse whose expiresAt is 00:00:00.000 UTC
  test.each(['abc', '900'])('Invalid timezone offset %s falls back to UTC midnight', async (tzOffsetMinutes) => {
    mockStorage();
    const user = await createUser();

    const response = await uploadPost(user.id, { tzOffsetMinutes });

    expect(response.status).toBe(201);
    const expiresAt = new Date(response.body.expiresAt as string);
    expect(expiresAt.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // Mocked behavior: storage is available
  // Input: caption exceeding 280 characters
  // Expected status code: 400
  // Expected behavior: photo is not uploaded and no post is saved
  // Expected output: error mentioning caption length
  test('Rejects caption over 280 characters before uploading', async () => {
    const storage = mockStorage();
    const user = await createUser();

    const response = await uploadPost(user.id, { caption: 'x'.repeat(281) });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/caption must be at most 280 characters/);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await Post.countDocuments()).toBe(0);
  });

  // Mocked behavior: storage rejects the upload
  // Input: valid photo
  // Expected status code: 500
  // Expected behavior: no post is saved in the database
  // Expected output: { error: "Internal server error" }
  test('Storage upload fails', async () => {
    mockStorage({ uploadError: new Error('Forced storage error') });
    const user = await createUser();

    const response = await uploadPost(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(await Post.countDocuments()).toBe(0);
  });

  // Mocked behavior: storage upload succeeds, but Post.create throws a database error
  // Input: valid photo
  // Expected status code: 500
  // Expected behavior: the uploaded photo is deleted so no orphaned blob remains
  // Expected output: { error: "Internal server error" }
  test('Database error removes the stored photo', async () => {
    const storage = mockStorage();
    jest.spyOn(Post, 'create').mockImplementation(() => {
      throw new Error('Forced database error');
    });
    const user = await createUser();

    const response = await uploadPost(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    const storedKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(storage.deleteFile).toHaveBeenCalledWith(storedKey);
  });

  // Mocked behavior: Post.create fails and cleanup deleteFile also fails
  // Input: valid photo
  // Expected status code: 500
  // Expected behavior: original database error is reported; cleanup failure is logged
  // Expected output: { error: "Internal server error" }
  test('Orphan cleanup failure is logged, not reported', async () => {
    mockStorage({ deleteError: new Error('Forced delete error') });
    jest.spyOn(Post, 'create').mockImplementation(() => {
      throw new Error('Forced database error');
    });
    const user = await createUser();

    const response = await uploadPost(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not delete orphaned post photo/), expect.any(Error));
  });
});

// Interface GET /posts
describe('Mocked: GET /posts', () => {
  // Mocked behavior: storage signs photo URLs for feed posts
  // Input: active posts from the user and a friend
  // Expected status code: 200
  // Expected behavior: each post gets its signed download URL
  // Expected output: { posts: [...] } with populated imageUrl fields
  test('Returns feed posts with signed image URLs', async () => {
    mockStorage();
    const user = await createUser();
    const friend = await createUser();
    await makeFriends(user.id, friend.id);
    await createPost(friend.id, { imageKey: 'posts/friend-fit.jpg', caption: 'Clean fit' });

    const response = await request(app).get('/posts').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0]).toMatchObject({
      caption: 'Clean fit',
      imageUrl: 'https://storage.test/posts/friend-fit.jpg?sig=test',
    });
  });

  // Mocked behavior: storage fails to sign the download URL
  // Input: active post in feed
  // Expected status code: 200
  // Expected behavior: post still loads with imageUrl null and error logged
  // Expected output: post with imageUrl null
  test('Feed still loads when URL signing fails', async () => {
    mockStorage({ signError: new Error('Forced signing error') });
    const user = await createUser();
    await createPost(user.id, { imageKey: 'posts/broken.jpg' });

    const response = await request(app).get('/posts').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.posts[0].imageUrl).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not create image URL for post key/), expect.any(Error));
  });

  // Mocked behavior: Post.find throws a database error
  // Input: signed-in user
  // Expected status code: 500
  // Expected behavior: error is handled and logged
  // Expected output: { error: "Internal server error" }
  test('Database error while listing feed', async () => {
    const user = await createUser();
    jest.spyOn(Post, 'find').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app).get('/posts').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });
});

// Interface POST /posts/:id/like
describe('Mocked: POST /posts/:id/like', () => {
  // Mocked behavior: Post.findOneAndUpdate throws a database error
  // Input: valid post id
  // Expected status code: 500
  // Expected behavior: error is handled and logged; the like is not saved
  // Expected output: { error: "Internal server error" }
  test('Database error while liking a post', async () => {
    const user = await createUser();
    const post = await createPost(user.id);
    jest.spyOn(Post, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app).post(`/posts/${post.id}/like`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
    expect((await Post.findById(post.id))?.likes).toHaveLength(0);
  });

  // Mocked behavior: Post.findOneAndUpdate finds no post, as when the post expires between the
  //   friendship check and the update
  // Input: a friend's active post id
  // Expected status code: 404
  // Expected behavior: nothing is updated
  // Expected output: { error: "Post not found or has expired" }
  test('Post expires before the like is saved', async () => {
    const user = await createUser();
    const friend = await createUser();
    await makeFriends(user.id, friend.id);
    const post = await createPost(friend.id);
    jest.spyOn(Post, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app).post(`/posts/${post.id}/like`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Post not found or has expired' });
    expect((await Post.findById(post.id))?.likes).toHaveLength(0);
  });
});

// Interface DELETE /posts/:id/like
describe('Mocked: DELETE /posts/:id/like', () => {
  // Mocked behavior: Post.findOneAndUpdate throws a database error
  // Input: id of a post the user liked
  // Expected status code: 500
  // Expected behavior: error is handled and logged; the like is kept
  // Expected output: { error: "Internal server error" }
  test('Database error while unliking a post', async () => {
    const user = await createUser();
    const post = await createPost(user.id, { likes: [user.id] });
    jest.spyOn(Post, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app).delete(`/posts/${post.id}/like`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
    expect((await Post.findById(post.id))?.likes).toHaveLength(1);
  });
});

// Interface DELETE /posts/:id
describe('Mocked: DELETE /posts/:id', () => {
  // Mocked behavior: storage deletes the blob when the author deletes their post
  // Input: author's post id
  // Expected status code: 204
  // Expected behavior: post document and stored image blob are both removed
  // Expected output: empty body
  test('Deleting a post also deletes its stored image', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const post = await createPost(user.id, { imageKey: 'posts/delete-me.jpg' });

    const response = await request(app).delete(`/posts/${post.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(await Post.findById(post.id)).toBeNull();
    expect(storage.deleteFile).toHaveBeenCalledWith('posts/delete-me.jpg');
  });

  // Mocked behavior: storage fails to delete the stored image
  // Input: author's post id
  // Expected status code: 204
  // Expected behavior: the post is still deleted; the storage failure is only logged
  // Expected output: empty body
  test('Failing to delete the stored image is logged, not reported', async () => {
    mockStorage({ deleteError: new Error('Forced delete error') });
    const user = await createUser();
    const post = await createPost(user.id, { imageKey: 'posts/delete-me.jpg' });

    const response = await request(app).delete(`/posts/${post.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(await Post.findById(post.id)).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Could not delete post photo posts/delete-me.jpg:', expect.any(Error));
  });

  // Mocked behavior: Post.findOneAndDelete throws a database error
  // Input: author's post id
  // Expected status code: 500
  // Expected behavior: error is handled and logged; the post and its image are kept
  // Expected output: { error: "Internal server error" }
  test('Database error while deleting a post', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const post = await createPost(user.id);
    jest.spyOn(Post, 'findOneAndDelete').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await request(app).delete(`/posts/${post.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(await Post.findById(post.id)).not.toBeNull();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
