import { Router } from 'express';
import { createOutfit, deleteOutfit, generateOutfit, getOutfit, listOutfits, updateOutfit } from '../controllers/outfits.js';
import { requireAuth } from '../middleware/middleware.js';

export const outfitsRouter = Router();
outfitsRouter.use(requireAuth);
outfitsRouter.post('/', createOutfit);
outfitsRouter.post('/generate', generateOutfit);
outfitsRouter.get('/', listOutfits);
outfitsRouter.get('/:id', getOutfit);
outfitsRouter.patch('/:id', updateOutfit);
outfitsRouter.delete('/:id', deleteOutfit);
