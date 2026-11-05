import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/users.js';
import { requireAuth } from '../middleware/middleware.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);
usersRouter.get('/me', getProfile);
usersRouter.patch('/me', updateProfile);
