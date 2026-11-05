import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';

export const DATABASE_SETUP_TIMEOUT_MS = 120_000;

let server: MongoMemoryServer | undefined;

export async function startTestDatabase(): Promise<void> {
  console.log('[TEST DB] Starting MongoMemoryServer...');

  server = await MongoMemoryServer.create({
    binary: {
      version: '7.0.14',
    },
    instance: {
      dbName: 'fabricate_test',
    },
  });

  console.log('[TEST DB] MongoDB started:', server.getUri());

  await connectDatabase(server.getUri());

  console.log('[TEST DB] Mongoose connected');

  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );

  console.log('[TEST DB] Indexes initialized');
}

export async function clearTestDatabase(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map(
      (collection) => collection.deleteMany({}),
    ),
  );
}

export async function stopTestDatabase(): Promise<void> {
  await disconnectDatabase();
  await server?.stop();
  server = undefined;
}
