import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import '../../src/models/clothingItem.js';
import '../../src/models/outfit.js';
import '../../src/models/user.js';

// Starts a real, throwaway MongoDB for a test file. The first run downloads a MongoDB binary.
export const DATABASE_SETUP_TIMEOUT_MS = 120_000;

let server: MongoMemoryServer | undefined;

export async function startTestDatabase(): Promise<void> {
  server = await MongoMemoryServer.create();
  await connectDatabase(server.getUri());
  // Build indexes (e.g. unique googleId) before tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function clearTestDatabase(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
}

export async function stopTestDatabase(): Promise<void> {
  await disconnectDatabase();
  await server?.stop();
}
