import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { attachRoomSockets } from './sockets/rooms.js';

const app = createApp();
const server = http.createServer(app);
attachRoomSockets(server);

// Connect to the database before accepting requests.
try {
  await connectDatabase(env.mongodbUri);
} catch (err) {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
}

server.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  });
}
