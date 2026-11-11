import { Router } from 'express';
import { createPost, deletePost, listPosts } from '../controllers/posts.js';
import { requireAuth } from '../middleware/middleware.js';

export const postsRouter = Router();
postsRouter.use(requireAuth);
postsRouter.post('/', createPost);
postsRouter.get('/', listPosts);
postsRouter.delete('/:id', deletePost);
