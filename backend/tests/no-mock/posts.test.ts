import request from 'supertest';

import { createApp } from '../../src/app.js';
import { Post } from '../../src/models/posts.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createPost, createUser, makeFriends, UNKNOWN_ID } from '../helpers/fixtures.js';

const app = createApp();

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PHOTO = { filename: 'ootd.jpg', contentType: 'image/jpeg' };
const GIF = { filename: 'ootd.gif', contentType: 'image/gif' };
const TOO_LARGE = Buffer.alloc(5 * 1024 * 1024 + 1);

// Interface POST /posts
// File storage isn't configured in these tests, so everything here is checked before a photo
// would be stored. The full upload flow is in tests/mock/posts.test.ts.
describe('Unmocked: POST /posts', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected; nothing is saved
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).post('/posts').attach('photo', JPEG, PHOTO);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: request without a photo
  // Expected status code: 400
  // Expected behavior: nothing is saved
  // Expected output: error explaining the "photo" form field
  test('Missing photo', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/posts')
      .set('Authorization', authHeader(user.id))
      .field('caption', 'OOTD');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Missing photo/);
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: photo sent under the wrong form field name
  // Expected status code: 400
  // Expected behavior: nothing is saved
  // Expected output: error naming the unexpected field
  test('Wrong form field', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/posts')
      .set('Authorization', authHeader(user.id))
      .attach('image', JPEG, PHOTO);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid upload.*image/);
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: two files under the "photo" field
  // Expected status code: 400
  // Expected behavior: nothing is saved
  // Expected output: error naming the upload limit
  test('More than one photo', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/posts')
      .set('Authorization', authHeader(user.id))
      .attach('photo', JPEG, PHOTO)
      .attach('photo', JPEG, PHOTO);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid upload/);
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: a GIF (unsupported image type)
  // Expected status code: 400
  // Expected behavior: nothing is saved
  // Expected output: error listing the supported types
  test('Unsupported image type', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/posts')
      .set('Authorization', authHeader(user.id))
      .attach('photo', Buffer.from('GIF89a'), GIF);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Unsupported image type/);
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: a photo larger than 5 MB
  // Expected status code: 413
  // Expected behavior: nothing is saved
  // Expected output: { error: "The photo must be at most 5 MB" }
  test('Photo too large', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/posts')
      .set('Authorization', authHeader(user.id))
      .attach('photo', TOO_LARGE, { filename: 'huge.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'The photo must be at most 5 MB' });
    expect(await Post.countDocuments()).toBe(0);
  });

  // Input: a valid JPEG while file storage isn't configured
  // Expected status code: 503
  // Expected behavior: nothing is saved
  // Expected output: { error: "File storage is not available" }
  test('Storage not configured', async () => {
    const user = await createUser();

    const response = await request(app).post('/posts').set('Authorization', authHeader(user.id)).attach('photo', JPEG, PHOTO);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'File storage is not available' });
    expect(await Post.countDocuments()).toBe(0);
  });
});

// Interface GET /posts
describe('Unmocked: GET /posts', () => {
  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const response = await request(app).get('/posts');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing token' });
  });

  // Input: signed-in user with no active posts from self or friends
  // Expected status code: 200
  // Expected behavior: nothing is changed
  // Expected output: { posts: [] }
  test('Empty feed', async () => {
    const user = await createUser();

    const response = await request(app).get('/posts').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ posts: [] });
  });

  // Input: active posts from user, direct friend, friend-of-a-friend, and stranger, plus an expired post
  // Expected status code: 200
  // Expected behavior: only unexpired posts from user and direct friends are returned, newest first
  // Expected output: { posts: [...] } without internal fields like imageKey or likes array
  test('Returns active posts from user and direct friends only, newest first', async () => {
    const user = await createUser();
    const friend = await createUser();
    const friendOfFriend = await createUser();
    const stranger = await createUser();
    await makeFriends(user.id, friend.id);
    await makeFriends(friend.id, friendOfFriend.id);

    await createPost(user.id, { caption: 'My morning fit' });
    await createPost(friend.id, { caption: 'Friend afternoon fit' });
    await createPost(friend.id, {
      caption: 'Yesterday expired fit',
      expiresAt: new Date(Date.now() - 1_000),
    });
    await createPost(friendOfFriend.id, { caption: 'FOAF fit' });
    await createPost(stranger.id, { caption: 'Stranger fit' });

    const response = await request(app).get('/posts').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.posts.map((p: { caption: string }) => p.caption)).toEqual([
      'Friend afternoon fit',
      'My morning fit',
    ]);
    expect(Object.keys(response.body.posts[0] as object).sort()).toEqual(
      [
        'authorId',
        'authorName',
        'caption',
        'createdAt',
        'expiresAt',
        'id',
        'imageUrl',
        'likeCount',
        'likedByMe',
      ].sort()
    );
    expect(response.body.posts[0].imageUrl).toBeNull();
  });

  // Input: a friend's post liked by the viewer and by a friend-of-a-friend
  // Expected status code: 200
  // Expected behavior: total likeCount includes all users who liked the post, not just viewer's friends
  // Expected output: likeCount 2 and likedByMe true
  test('Includes total likes from mutual/non-mutual friends of the author', async () => {
    const user = await createUser();
    const friend = await createUser();
    const friendOfFriend = await createUser();
    await makeFriends(user.id, friend.id);
    await makeFriends(friend.id, friendOfFriend.id);

    await createPost(friend.id, { likes: [user.id, friendOfFriend.id] });

    const response = await request(app).get('/posts').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0]).toMatchObject({
      authorId: friend.id,
      likeCount: 2,
      likedByMe: true,
    });
  });
});

// Interface POST /posts/:id/like and DELETE /posts/:id/like
describe('Unmocked: POST and DELETE /posts/:id/like', () => {
  // Input: valid post id from a friend; liked twice by the same user, then unliked
  // Expected status code: 200
  // Expected behavior: liking is idempotent (no duplicate likes); unliking removes the user's like
  // Expected output: updated PostResponse with accurate likeCount and likedByMe
  test('Likes (idempotently) and unlikes a friend post', async () => {
    const user = await createUser();
    const friend = await createUser();
    const friendOfFriend = await createUser();
    await makeFriends(user.id, friend.id);
    await makeFriends(friend.id, friendOfFriend.id);

    const post = await createPost(friend.id, { likes: [friendOfFriend.id] });

    const firstLike = await request(app)
      .post(`/posts/${post.id}/like`)
      .set('Authorization', authHeader(user.id));
    expect(firstLike.status).toBe(200);
    expect(firstLike.body).toMatchObject({ id: post.id, likeCount: 2, likedByMe: true });

    const duplicateLike = await request(app)
      .post(`/posts/${post.id}/like`)
      .set('Authorization', authHeader(user.id));
    expect(duplicateLike.status).toBe(200);
    expect(duplicateLike.body).toMatchObject({ id: post.id, likeCount: 2, likedByMe: true });

    const unlike = await request(app)
      .delete(`/posts/${post.id}/like`)
      .set('Authorization', authHeader(user.id));
    expect(unlike.status).toBe(200);
    expect(unlike.body).toMatchObject({ id: post.id, likeCount: 1, likedByMe: false });
  });

  // Input: user's own active post
  // Expected status code: 200
  // Expected behavior: author can like their own post
  // Expected output: likeCount 1, likedByMe true
  test('Author can like own post', async () => {
    const user = await createUser();
    const post = await createPost(user.id);

    const response = await request(app)
      .post(`/posts/${post.id}/like`)
      .set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: post.id, likeCount: 1, likedByMe: true });
  });

  // Input: post belonging to a user who is not a friend
  // Expected status code: 403
  // Expected behavior: like is rejected; post likes remain empty
  // Expected output: { error: "You can only like posts from your friends" }
  test('Rejects liking a non-friend post', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const post = await createPost(stranger.id);

    const response = await request(app)
      .post(`/posts/${post.id}/like`)
      .set('Authorization', authHeader(user.id));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'You can only like posts from your friends' });
    expect((await Post.findById(post.id))?.likes).toHaveLength(0);
  });

  // Input: expired post id or unknown post id
  // Expected status code: 404
  // Expected behavior: nothing is updated
  // Expected output: { error: "Post not found or has expired" }
  test.each(['expired', 'unknown'] as const)('Rejects %s post on like/unlike', async (kind) => {
    const user = await createUser();
    const expiredPost = await createPost(user.id, { expiresAt: new Date(Date.now() - 5_000) });
    const targetId = kind === 'expired' ? expiredPost.id : UNKNOWN_ID;

    const likeRes = await request(app).post(`/posts/${targetId}/like`).set('Authorization', authHeader(user.id));
    const unlikeRes = await request(app).delete(`/posts/${targetId}/like`).set('Authorization', authHeader(user.id));

    expect(likeRes.status).toBe(404);
    expect(likeRes.body).toEqual({ error: 'Post not found or has expired' });
    expect(unlikeRes.status).toBe(404);
    expect(unlikeRes.body).toEqual({ error: 'Post not found or has expired' });
  });

  // Input: malformed post id
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid post id" }
  test('Invalid post id', async () => {
    const user = await createUser();

    const likeRes = await request(app).post('/posts/not-an-id/like').set('Authorization', authHeader(user.id));
    const unlikeRes = await request(app).delete('/posts/not-an-id/like').set('Authorization', authHeader(user.id));

    expect(likeRes.status).toBe(400);
    expect(likeRes.body).toEqual({ error: 'Invalid post id' });
    expect(unlikeRes.status).toBe(400);
    expect(unlikeRes.body).toEqual({ error: 'Invalid post id' });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing token" }
  test('Missing token', async () => {
    const likeRes = await request(app).post(`/posts/${UNKNOWN_ID}/like`);
    const unlikeRes = await request(app).delete(`/posts/${UNKNOWN_ID}/like`);

    expect(likeRes.status).toBe(401);
    expect(unlikeRes.status).toBe(401);
  });
});

// Interface DELETE /posts/:id
describe('Unmocked: DELETE /posts/:id', () => {
  // Input: id of the user's own post
  // Expected status code: 204
  // Expected behavior: post is removed from the database
  // Expected output: empty body
  test('Deletes own post', async () => {
    const user = await createUser();
    const post = await createPost(user.id);

    const response = await request(app).delete(`/posts/${post.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(await Post.findById(post.id)).toBeNull();
  });

  // Input: id of a friend's post
  // Expected status code: 404
  // Expected behavior: friend's post is not deleted
  // Expected output: { error: "Post not found or has expired" }
  test("Cannot delete another user's post", async () => {
    const user = await createUser();
    const friend = await createUser();
    await makeFriends(user.id, friend.id);
    const post = await createPost(friend.id);

    const response = await request(app).delete(`/posts/${post.id}`).set('Authorization', authHeader(user.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Post not found or has expired' });
    expect(await Post.findById(post.id)).not.toBeNull();
  });

  // Input: malformed id and no Authorization header
  // Expected status code: 400 and 401
  // Expected behavior: request is rejected
  // Expected output: error message
  test('Invalid id and missing token', async () => {
    const user = await createUser();

    const invalidId = await request(app).delete('/posts/not-an-id').set('Authorization', authHeader(user.id));
    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({ error: 'Invalid post id' });

    const noToken = await request(app).delete(`/posts/${UNKNOWN_ID}`);
    expect(noToken.status).toBe(401);
    expect(noToken.body).toEqual({ error: 'Missing token' });
  });
});
