import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';

const app = createApp();
const server = http.createServer(app);

try {
  await connectDatabase(env.mongodbUri);
} catch (err) {
  throw new Error('Failed to connect to MongoDB', { cause: err });
}

server.listen(env.port, () => {
  console.info(`Server listening on port ${env.port}`);
});

// Once the server and the database connection are closed, nothing keeps Node running, so it exits.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      disconnectDatabase().catch((err: unknown) => {
        console.error('Failed to disconnect from MongoDB:', err);
        process.exitCode = 1;
      });
    });
  });
}
