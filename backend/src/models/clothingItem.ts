import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

// Shared by the API validation, the closet filters and the photo classifier,
// so every part of the app uses the same category values.
export const CLOTHING_CATEGORIES = ['top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory'] as const;
export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export const CLOTHING_LIMITS = {
  nameLength: 100,
  colorLength: 50,
  styleLength: 50,
  tagLength: 30,
  maxTags: 20,
} as const;

const clothingItemSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: CLOTHING_LIMITS.nameLength },
    category: { type: String, required: true, enum: CLOTHING_CATEGORIES },
    color: { type: String, required: true, trim: true, maxlength: CLOTHING_LIMITS.colorLength },
    style: { type: String, required: true, trim: true, maxlength: CLOTHING_LIMITS.styleLength },
    tags: { type: [String], default: [] },
    isClean: { type: Boolean, default: true },
    // Storage key of the item's photo (not a URL); download URLs are generated when needed.
    imageKey: { type: String, required: true },
  },
  { timestamps: true }
);

clothingItemSchema.index({ owner: 1, category: 1 });

export type ClothingItemDocument = HydratedDocument<InferSchemaType<typeof clothingItemSchema>>;

export const ClothingItem = model('ClothingItem', clothingItemSchema);

export interface ClothingItemResponse {
  id: string;
  name: string;
  category: string;
  color: string;
  style: string;
  tags: string[];
  isClean: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Single place that decides what the app sees for a clothing item.
export function toClothingItemResponse(item: ClothingItemDocument): ClothingItemResponse {
  return {
    id: item._id.toString(),
    name: item.name,
    category: item.category,
    color: item.color,
    style: item.style,
    tags: [...item.tags],
    isClean: item.isClean,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
