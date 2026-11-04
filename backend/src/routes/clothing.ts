import { Router } from 'express';
import multer from 'multer';
import {
  deleteClothingItem,
  getClothingItem,
  listClothingItems,
  updateClothingItem,
  uploadClothingItem,
  generateClothingItemMesh,
  getClothingItemModel
} from '../controllers/clothing.js';
import { requireAuth } from '../middleware/middleware.js';
import { MAX_IMAGE_BYTES } from '../services/classifier.js';

// Keeps the uploaded photos in memory (they're sent to the classifier and storage, never written to disk).
// fileSize applies to each photo separately.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2 },
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'backPhoto', maxCount: 1 },
]);

export const clothingRouter = Router();
clothingRouter.use(requireAuth);
clothingRouter.post('/', photoUpload, uploadClothingItem);
clothingRouter.get('/', listClothingItems);
clothingRouter.get('/:id', getClothingItem);
clothingRouter.patch('/:id', updateClothingItem);
clothingRouter.delete('/:id', deleteClothingItem);
clothingRouter.post('/:id/generate', generateClothingItemMesh);
clothingRouter.get('/:id/model', getClothingItemModel);
