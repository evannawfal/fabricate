import { Schema, model } from 'mongoose';

const catalogItemSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true },
    imageUrl: { type: String, required: true },
    link: { type: String, required: true },
    store: { type: String, required: true },
  },
  { _id: false }
);

const cachedCatalogSearchSchema = new Schema({
  term: { type: String, required: true },
  country: { type: String, required: true },
  items: { type: [catalogItemSchema], required: true },
  fetchedAt: { type: Date, required: true },
});

cachedCatalogSearchSchema.index({ term: 1, country: 1 }, { unique: true });

export const CachedCatalogSearch = model('CachedCatalogSearch', cachedCatalogSearchSchema);
