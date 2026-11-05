import { Router } from 'express';
import { getRecommendations } from '../controllers/recommendations.js';
import { requireAuth } from '../middleware/middleware.js';

export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);
recommendationsRouter.get('/', getRecommendations);
