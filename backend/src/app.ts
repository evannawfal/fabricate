import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { clothingRouter } from './routes/clothing.js';
import { outfitsRouter } from './routes/outfits.js';
import { avatarRouter } from './routes/avatar.js';
import { roomsRouter } from './routes/rooms.js';
import { friendsRouter } from './routes/friends.js';
import { usersRouter } from './routes/users.js';

export function createApp(): Express {
  const app = express();

  // So req.ip reflects the real client when behind a reverse proxy.
  app.set('trust proxy', true);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/clothing', clothingRouter);
  app.use('/outfits', outfitsRouter);
  app.use('/avatar', avatarRouter);
  app.use('/rooms', roomsRouter);
  app.use('/friends', friendsRouter);
  app.use('/users', usersRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use(errorHandler);

  return app;
}

