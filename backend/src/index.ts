import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { createApp } from './app';
import { env } from './config/env';

// The fixed course-provided pixel stream (Button 2).
const COURSE_WS_URL = 'wss://8.229.22.124';
const RECONNECT_DELAY_MS = 3000;

// Button 2: hold one connection to the course server and forward every pixel,
// unchanged, to all front-end clients connected on /ws/pixels.
function attachPixelRelay(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/pixels' });

  function connectUpstream(): void {
    // The course server uses a self-signed certificate bound to an IP address,
    // so certificate verification is disabled for this connection.
    const upstream = new WebSocket(COURSE_WS_URL, { rejectUnauthorized: false });

    upstream.on('message', (data: WebSocket.RawData) => {
      const payload = data.toString();
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    });

    upstream.on('close', () => {
      setTimeout(connectUpstream, RECONNECT_DELAY_MS);
    });

    upstream.on('error', () => {
      upstream.close();
    });
  }

  connectUpstream();
}

const app = createApp();
const server = http.createServer(app);
attachPixelRelay(server);

server.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
