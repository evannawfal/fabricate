import { Router } from 'express';
import { createAvatar } from '../controllers/avatar.js';
import { requireAuth } from '../middleware/middleware.js';

export const avatarRouter = Router();
// avatarRouter.use(requireAuth);
avatarRouter.post('/', createAvatar);
