import { Schema, model, type InferSchemaType } from 'mongoose';

// One document per Google account. Feature-specific profile data (avatar settings,
// friends, push tokens, ...) is added here as those features are built.
const userSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String },
    givenName: { type: String },
    familyName: { type: String },
    avatarModelKey: {
      type: String,
      default: null,
    },
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    pronouns: { type: String, trim: true, maxlength: 30, default: '' },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User = model('User', userSchema);

export function displayName(user: { givenName?: string | null; familyName?: string | null; email?: string | null }): string {
  return [user.givenName, user.familyName].filter(Boolean).join(' ') || user.email || 'Unknown user';
}

export async function getFriendIds(userId: string): Promise<string[]> {
  const user = await User.findById(userId, { friends: 1 });
  return user?.friends.map((id) => id.toString()) ?? [];
}
