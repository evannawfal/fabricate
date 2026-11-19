import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { ClothingItem, type ClothingCategory } from '../../src/models/clothingItem.js';
import { Outfit } from '../../src/models/outfit.js';
import { Room } from '../../src/models/room.js';
import { User } from '../../src/models/user.js';
import { Post } from '../../src/models/posts.js';

let userCount = 0;

export async function createUser() {
  userCount += 1;
  return User.create({
    googleId: `google-test-user-${userCount}`,
    email: `user${userCount}@example.com`,
    givenName: 'Test',
    familyName: `User ${userCount}`,
  });
}

// Authorization header value for a user, signed like the real sign-in endpoint.
export function authHeader(userId: string, options: { secret?: string; expiresIn?: number } = {}): string {
  const token = jwt.sign({ sub: userId }, options.secret ?? env.jwtAccessSecret, {
    expiresIn: options.expiresIn ?? 1800,
  });
  return `Bearer ${token}`;
}

export interface ClothingItemOverrides {
  name?: string;
  category?: ClothingCategory;
  color?: string;
  style?: string;
  tags?: string[];
  isClean?: boolean;
  isArchived?: boolean;
  imageKey?: string;
  backImageKey?: string | null;
}

export async function createClothingItem(ownerId: string, overrides: ClothingItemOverrides = {}) {
  return ClothingItem.create({
    owner: ownerId,
    name: 'Blue shirt',
    category: 'top',
    color: 'blue',
    style: 'casual',
    imageKey: 'clothing/test-image.jpg',
    ...overrides,
  });
}

export async function createOutfit(ownerId: string, itemIds: string[], name = 'Weekend look') {
  return Outfit.create({ owner: ownerId, name, items: itemIds });
}

export async function makeFriends(userId: string, ...friendIds: string[]) {
  await User.updateOne({ _id: userId }, { $addToSet: { friends: { $each: friendIds } } });
  await User.updateMany({ _id: { $in: friendIds } }, { $addToSet: { friends: userId } });
}

// The first member is the host, as when a user creates a room.
export async function createRoom(name: string, memberIds: [string, ...string[]], outfitItems: string[] = []) {
  return Room.create({ name, host: memberIds[0], members: memberIds, outfitItems });
}

export interface PostOverrides {
  imageKey?: string;
  caption?: string;
  likes?: string[];
  expiresAt?: Date;
}

export async function createPost(authorId: string, overrides: PostOverrides = {}) {
  const defaultExpiry = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return Post.create({
    author: authorId,
    imageKey: 'posts/test-ootd.jpg',
    caption: 'Today’s fit',
    likes: [],
    expiresAt: defaultExpiry,
    ...overrides,
  });
}

// A valid id that doesn't belong to any document.
export const UNKNOWN_ID = '0123456789abcdef01234567';