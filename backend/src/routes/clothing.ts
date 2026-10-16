import { Router } from 'express';
import {
  deleteClothingItem,
  getClothingItem,
  listClothingItems,
  updateClothingItem,
} from '../controllers/clothing.js';
import { requireAuth } from '../middleware/middleware.js';

export const clothingRouter = Router();
clothingRouter.use(requireAuth);
clothingRouter.get('/', listClothingItems);
clothingRouter.get('/:id', getClothingItem);
clothingRouter.patch('/:id', updateClothingItem);
clothingRouter.delete('/:id', deleteClothingItem);
