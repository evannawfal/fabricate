import { Schema, model, type InferSchemaType } from 'mongoose';

// One document per Google account. Feature-specific profile data (avatar settings,
// friends, push tokens, ...) is added here as those features are built.
const userSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String },
    givenName: { type: String },
    familyName: { type: String },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User = model('User', userSchema);
