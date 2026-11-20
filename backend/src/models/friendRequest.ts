import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { FriendResponse } from './user.js';

const friendRequestSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One pending request each way between two users.
friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });
friendRequestSchema.index({ to: 1, createdAt: -1 });

export type FriendRequestDocument = HydratedDocument<InferSchemaType<typeof friendRequestSchema>>;

export const FriendRequest = model('FriendRequest', friendRequestSchema);

// [user] is the other person: the sender of an incoming request, or the recipient of an outgoing one.
export interface FriendRequestResponse {
  id: string;
  user: FriendResponse;
  sentAt: Date;
}
