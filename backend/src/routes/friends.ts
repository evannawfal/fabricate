import { Router } from 'express';
import { addFriend, listFriends, removeFriend } from '../controllers/friends.js';
import { requireAuth } from '../middleware/middleware.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);
friendsRouter.get('/', listFriends);
friendsRouter.post('/', addFriend);
friendsRouter.delete('/:id', removeFriend);
