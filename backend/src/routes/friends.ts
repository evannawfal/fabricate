import { Router } from 'express';
import {
  acceptFriendRequest,
  deleteFriendRequest,
  listFriendRequests,
  sendFriendRequest,
} from '../controllers/friendRequests.js';
import { listFriends, removeFriend } from '../controllers/friends.js';
import { requireAuth } from '../middleware/middleware.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);
friendsRouter.get('/', listFriends);
friendsRouter.delete('/:id', removeFriend);
friendsRouter.get('/requests', listFriendRequests);
friendsRouter.post('/requests', sendFriendRequest);
friendsRouter.post('/requests/:id/accept', acceptFriendRequest);
friendsRouter.delete('/requests/:id', deleteFriendRequest);
