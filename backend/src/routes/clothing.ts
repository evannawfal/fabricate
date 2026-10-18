import { Router } from 'express';
import multer from 'multer';
import {
  deleteClothingItem,
  getClothingItem,
  listClothingItems,
  updateClothingItem,
  uploadClothingItem,
} from '../controllers/clothing.js';
import { requireAuth } from '../middleware/middleware.js';
import { MAX_IMAGE_BYTES } from '../services/classifier.js';

// Keeps the uploaded photo in memory (it's sent to the classifier and storage, never written to disk).
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('photo');

export const clothingRouter = Router();
clothingRouter.use(requireAuth);
clothingRouter.post('/', photoUpload, uploadClothingItem);
clothingRouter.get('/', listClothingItems);
clothingRouter.get('/:id', getClothingItem);
clothingRouter.patch('/:id', updateClothingItem);
clothingRouter.delete('/:id', deleteClothingItem);
