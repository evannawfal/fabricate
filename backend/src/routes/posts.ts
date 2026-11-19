import { Router } from 'express';
import multer from 'multer';
import { createPost, deletePost, likePost, listFeedPosts, unlikePost } from '../controllers/posts.js';
import { requireAuth } from '../middleware/middleware.js';
import { MAX_IMAGE_BYTES } from '../services/classifier.js';

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('photo');

export const postsRouter = Router();
postsRouter.use(requireAuth);
postsRouter.get('/', listFeedPosts);
postsRouter.post('/', photoUpload, createPost);
postsRouter.post('/:id/like', likePost);
postsRouter.delete('/:id/like', unlikePost);
postsRouter.delete('/:id', deletePost);