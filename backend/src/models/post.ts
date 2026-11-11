import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { ClothingItemResponse } from './clothingItem.js';
import { OUTFIT_LIMITS } from './outfit.js';

// Friends see a post for this long after it's posted.
export const POST_VISIBLE_HOURS = 24;

// Each user has one post at a time. It copies the outfit's name and items, so it keeps showing
// what was posted even if the outfit is later edited or deleted.
const postSchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  outfit: { type: Schema.Types.ObjectId, ref: 'Outfit', required: true },
  name: { type: String, required: true, maxlength: OUTFIT_LIMITS.nameLength },
  items: [{ type: Schema.Types.ObjectId, ref: 'ClothingItem' }],
  postedAt: { type: Date, required: true },
});

postSchema.index({ postedAt: -1 });

export type PostDocument = HydratedDocument<InferSchemaType<typeof postSchema>>;

export const Post = model('Post', postSchema);

export interface PostResponse {
  id: string;
  author: { id: string; name: string };
  isOwn: boolean;
  outfitId: string;
  name: string;
  items: ClothingItemResponse[];
  postedAt: Date;
}

export function toPostResponse(
  post: PostDocument,
  details: { authorName: string; isOwn: boolean; items: ClothingItemResponse[] }
): PostResponse {
  return {
    id: post._id.toString(),
    author: { id: post.author.toString(), name: details.authorName },
    isOwn: details.isOwn,
    outfitId: post.outfit.toString(),
    name: post.name,
    items: details.items,
    postedAt: post.postedAt,
  };
}
