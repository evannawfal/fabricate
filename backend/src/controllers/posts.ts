import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { POST_LIMITS, Post, toPostResponse, type PostDocument } from '../models/posts.js';
import { User, displayName, getFriendIds } from '../models/user.js';
import { InvalidImageError, MAX_IMAGE_BYTES, SUPPORTED_IMAGE_TYPES } from '../services/classifier.js';
import { getFileStorage, isFileStorageConfigured } from '../services/storage.js';
import { postImageKey, type ImageExtension } from '../services/storageKeys.js';
import { isObjectId, parseText } from '../validation/common.js';

const INVALID_ID = { error: 'Invalid post id' };
const NOT_FOUND = { error: 'Post not found or has expired' };

const IMAGE_EXTENSIONS: Record<string, ImageExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function checkPostPhoto(file: Express.Multer.File | undefined): ImageExtension {
  if (!file) {
    throw new InvalidImageError('Missing photo: send the image as the "photo" field of a multipart form');
  }
  const extension = IMAGE_EXTENSIONS[file.mimetype];
  if (!extension) {
    throw new InvalidImageError(`Unsupported image type; use one of: ${SUPPORTED_IMAGE_TYPES.join(', ')}`);
  }
  if (file.buffer.byteLength === 0) {
    throw new InvalidImageError('The image is empty');
  }
  if (file.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new InvalidImageError(`The image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`);
  }
  return extension;
}

/**
 * Computes the next midnight (00:00:00.000) in the user's local timezone if `tzOffsetMinutes`
 * is provided (minutes east of UTC, e.g. -480 for PST), otherwise defaults to UTC midnight.
 */
function nextMidnight(rawOffset: unknown, now = new Date()): Date {
  let offsetMinutes = 0;
  if (typeof rawOffset === 'string' && rawOffset.trim() !== '') {
    const parsed = Number(rawOffset);
    if (Number.isInteger(parsed) && parsed >= -840 && parsed <= 840) {
      offsetMinutes = parsed;
    }
  }
  const offsetMs = offsetMinutes * 60_000;
  const localNow = new Date(now.getTime() + offsetMs);
  const localNextMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return new Date(localNextMidnight - offsetMs);
}

async function downloadUrlFor(key: string): Promise<string | null> {
  if (!key || !isFileStorageConfigured()) return null;
  try {
    return await getFileStorage().getDownloadUrl(key);
  } catch (err) {
    console.error(`Could not create image URL for post key ${key}:`, err);
    return null;
  }
}

async function hydratePosts(posts: PostDocument[], viewerId: string) {
  const authorIds = [...new Set(posts.map((p) => p.author.toString()))];
  const users = await User.find({ _id: { $in: authorIds } });
  const namesById = new Map(users.map((u) => [u.id as string, displayName(u)]));

  return Promise.all(
    posts.map(async (post) => {
      const authorId = post.author.toString();
      const imageUrl = await downloadUrlFor(post.imageKey);
      return toPostResponse(post, namesById.get(authorId) ?? 'Unknown user', imageUrl, viewerId);
    })
  );
}

// POST /posts (multipart/form-data: `photo` file required, `caption` optional, `tzOffsetMinutes` optional)
export async function createPost(req: AuthedRequest, res: Response) {
  const extension = checkPostPhoto(req.file);
  const storage = getFileStorage();
  const userId = getUserId(req);

  const rawCaption = (req.body as Record<string, unknown> | undefined)?.caption;
  let caption = '';
  if (rawCaption !== undefined) {
    const parsed = parseText(rawCaption, 'caption', POST_LIMITS.captionLength, { allowEmpty: true });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    caption = parsed.value;
  }

  const rawTzOffset = (req.body as Record<string, unknown> | undefined)?.tzOffsetMinutes;
  const expiresAt = nextMidnight(rawTzOffset);
  const key = postImageKey(userId, extension);

  let post: PostDocument;
  try {
    await storage.uploadFile(key, req.file!.buffer, req.file!.mimetype);
    post = await Post.create({
      author: userId,
      imageKey: key,
      caption,
      likes: [],
      expiresAt,
    });
  } catch (err) {
    await storage.deleteFile(key).catch((cleanupErr: unknown) => {
      console.error(`Could not delete orphaned post photo ${key}:`, cleanupErr);
    });
    throw err;
  }

  const [response] = await hydratePosts([post], userId);
  res.status(201).json(response);
}

// GET /posts — returns active (unexpired) posts from the user and their direct friends
export async function listFeedPosts(req: AuthedRequest, res: Response) {
  const userId = getUserId(req);
  const friendIds = await getFriendIds(userId);
  const visibleAuthors = [userId, ...friendIds];

  const posts = await Post.find({
    author: { $in: visibleAuthors },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1, _id: -1 });

  res.json({ posts: await hydratePosts(posts, userId) });
}

// POST /posts/:id/like — likes an active post if viewer is the author or a friend of the author
export async function likePost(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(INVALID_ID);

  const userId = getUserId(req);
  const post = await Post.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!post) return res.status(404).json(NOT_FOUND);

  const authorId = post.author.toString();
  if (authorId !== userId) {
    const friendIds = await getFriendIds(userId);
    if (!friendIds.includes(authorId)) {
      return res.status(403).json({ error: 'You can only like posts from your friends' });
    }
  }

  const updated = await Post.findOneAndUpdate(
    { _id: id, expiresAt: { $gt: new Date() } },
    { $addToSet: { likes: userId } },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(404).json(NOT_FOUND);

  const [response] = await hydratePosts([updated], userId);
  res.json(response);
}

// DELETE /posts/:id/like — removes the viewer's like from an active post
export async function unlikePost(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(INVALID_ID);

  const userId = getUserId(req);
  const updated = await Post.findOneAndUpdate(
    { _id: id, expiresAt: { $gt: new Date() } },
    { $pull: { likes: userId } },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(404).json(NOT_FOUND);

  const [response] = await hydratePosts([updated], userId);
  res.json(response);
}

// DELETE /posts/:id — lets the author delete their own post before midnight
export async function deletePost(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(INVALID_ID);

  const post = await Post.findOneAndDelete({ _id: id, author: getUserId(req) });
  if (!post) return res.status(404).json(NOT_FOUND);

  if (isFileStorageConfigured()) {
    await getFileStorage().deleteFile(post.imageKey).catch((err: unknown) => {
      console.error(`Could not delete post photo ${post.imageKey}:`, err);
    });
  }
  res.status(204).end();
}
