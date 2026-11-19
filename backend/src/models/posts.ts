import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const POST_LIMITS = {
  captionLength: 280,
} as const;

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    imageKey: { type: String, required: true },
    caption: { type: String, trim: true, maxlength: POST_LIMITS.captionLength, default: '' },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

postSchema.index({ author: 1, expiresAt: 1, createdAt: -1 });
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PostDocument = HydratedDocument<InferSchemaType<typeof postSchema>>;

export const Post = model('Post', postSchema);

export interface PostResponse {
  id: string;
  authorId: string;
  authorName: string;
  imageUrl: string | null;
  caption: string;
  likeCount: number;
  likedByMe: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export function toPostResponse(
  post: PostDocument,
  authorName: string,
  imageUrl: string | null,
  viewerId: string
): PostResponse {
  return {
    id: post._id.toString(),
    authorId: post.author.toString(),
    authorName,
    imageUrl,
    caption: post.caption,
    likeCount: post.likes.length,
    likedByMe: post.likes.some((id) => id.toString() === viewerId),
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
  };
}