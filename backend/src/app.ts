import express, { type Express } from 'express';
import { authRouter } from './routes/auth.js';

export function createApp(): Express {
  const app = express();

  // So req.ip reflects the real client when behind a reverse proxy.
  app.set('trust proxy', true);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}

