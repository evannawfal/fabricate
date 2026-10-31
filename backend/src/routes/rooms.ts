import { Router } from 'express';
import { createRoom, getRoom, listRooms, saveRoomOutfit } from '../controllers/rooms.js';
import { requireAuth } from '../middleware/middleware.js';

export const roomsRouter = Router();
roomsRouter.use(requireAuth);
roomsRouter.post('/', createRoom);
roomsRouter.get('/', listRooms);
roomsRouter.get('/:id', getRoom);
roomsRouter.post('/:id/save', saveRoomOutfit);
