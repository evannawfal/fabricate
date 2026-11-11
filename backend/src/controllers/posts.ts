import type { Response } from 'express';
import { getUserId, type AuthedRequest } from '../middleware/middleware.js';
import { ClothingItem } from '../models/clothingItem.js';
import { Outfit } from '../models/outfit.js';
import { POST_VISIBLE_HOURS, Post, toPostResponse, type PostDocument, type PostResponse } from '../models/post.js';
import { User, displayName, getFriendIds } from '../models/user.js';
import { toClothingItemResponsesWithImages } from '../services/clothingImages.js';
import { isObjectId } from '../validation/common.js';
import { validatePostInput } from '../validation/post.js';

const MS_PER_HOUR = 60 * 60 * 1000;

// One query each for the posts' authors and items rather than one per post.
async function toPostResponses(userId: string, posts: PostDocument[]): Promise<PostResponse[]> {
  const [authors, items] = await Promise.all([
    User.find({ _id: { $in: posts.map((post) => post.author) } }),
    ClothingItem.find({ _id: { $in: posts.flatMap((post) => post.items) } }),
  ]);
  const namesById = new Map(authors.map((user) => [user.id as string, displayName(user)]));
  const itemsById = new Map((await toClothingItemResponsesWithImages(items)).map((item) => [item.id, item]));
  return posts.map((post) =>
    toPostResponse(post, {
      authorName: namesById.get(post.author.toString()) ?? 'Unknown user',
      isOwn: post.author.toString() === userId,
      items: post.items.flatMap((id) => itemsById.get(id.toString()) ?? []),
    })
  );
}

// POST /posts
// Posting again replaces the user's previous post.
export async function createPost(req: AuthedRequest, res: Response) {
  const input = validatePostInput(req.body);
  if (!input.ok) return res.status(400).json({ error: input.error });
  const userId = getUserId(req);
  const outfit = await Outfit.findOne({ _id: input.value.outfitId, owner: userId });
  if (!outfit) return res.status(404).json({ error: 'Outfit not found' });
  const post = await Post.findOneAndUpdate(
    { author: userId },
    { $set: { outfit: outfit._id, name: outfit.name, items: outfit.items, postedAt: new Date() } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  const [response] = await toPostResponses(userId, [post]);
  res.status(201).json(response);
}

// GET /posts
// The user's own post is included so the app can show it and offer to delete it.
export async function listPosts(req: AuthedRequest, res: Response) {
  const userId = getUserId(req);
  const authors = [userId, ...(await getFriendIds(userId))];
  const since = new Date(Date.now() - POST_VISIBLE_HOURS * MS_PER_HOUR);
  const posts = await Post.find({ author: { $in: authors }, postedAt: { $gte: since } }).sort({ postedAt: -1, _id: -1 });
  res.json({ posts: await toPostResponses(userId, posts) });
}

// DELETE /posts/:id
export async function deletePost(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });
  const post = await Post.findById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author.toString() !== getUserId(req)) {
    return res.status(403).json({ error: 'You can only delete your own post' });
  }
  await Post.deleteOne({ _id: post._id });
  res.status(204).end();
}
