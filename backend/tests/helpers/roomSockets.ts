import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';

import { createApp } from '../../src/app.js';
import { attachRoomSockets } from '../../src/sockets/rooms.js';
import { clearTestDatabase, DATABASE_SETUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from './database.js';
import { authHeader } from './fixtures.js';

// Starts the app with room sockets for the calling test file, and disconnects every client after each test.
export function useRoomSocketServer() {
  const server = http.createServer(createApp());
  const io = attachRoomSockets(server);
  const clients: Socket[] = [];
  let url = '';

  beforeAll(async () => {
    await startTestDatabase();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  }, DATABASE_SETUP_TIMEOUT_MS);
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await clearTestDatabase();
  });
  afterAll(async () => {
    await io.close();
    await stopTestDatabase();
  });

  // Resolves once connected, or rejects with the server's error message.
  function join(auth: Record<string, unknown>): Promise<Socket> {
    const client = connect(url, { auth, transports: ['websocket'], reconnection: false });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  return { join };
}

export function tokenFor(userId: string): string {
  return authHeader(userId).slice('Bearer '.length);
}

export function nextEvent<T>(client: Socket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}
