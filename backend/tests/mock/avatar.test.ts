import { jest } from '@jest/globals';
import request from 'supertest';

import type { AvatarInput } from '../../src/avatar/types.js';
import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createUser, UNKNOWN_ID } from '../helpers/fixtures.js';

// Stand-in for the avatar generator: real generation takes seconds and is covered by
// tests/unit/meshGenerator.test.ts. ES modules must be mocked before the app is imported.
const exportAvatar = jest.fn<(input: AvatarInput) => Promise<Uint8Array>>();
jest.unstable_mockModule('../../src/avatar/exportAvatar.js', () => ({ exportAvatar }));
const { createApp } = await import('../../src/app.js');
const { User } = await import('../../src/models/user.js');

const app = createApp();

const MEASUREMENTS = { height: 1.75, shoulderWidth: 0.4, chestWidth: 0.35, waistWidth: 0.3, hipWidth: 0.32 };
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

// Stand-in for file storage (Azure Blob Storage).
function mockStorage(options: { uploadError?: Error; deleteError?: Error } = {}) {
  const storage = {
    uploadFile: jest.fn<FileStorage['uploadFile']>(() =>
      options.uploadError ? Promise.reject(options.uploadError) : Promise.resolve()
    ),
    getDownloadUrl: jest.fn<FileStorage['getDownloadUrl']>((key) => Promise.resolve(`https://storage.test/${key}?sig=test`)),
    deleteFile: jest.fn<FileStorage['deleteFile']>(() =>
      options.deleteError ? Promise.reject(options.deleteError) : Promise.resolve()
    ),
  };
  setFileStorage(storage);
  return storage;
}

function createAvatar(userId: string) {
  return request(app).post('/avatar').set('Authorization', authHeader(userId)).send(MEASUREMENTS);
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
beforeEach(() => {
  exportAvatar.mockReset();
  exportAvatar.mockResolvedValue(GLB);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setFileStorage(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /avatar
describe('Mocked: POST /avatar', () => {
  // Mocked behavior: the generator returns a model; storage accepts it
  // Input: valid measurements
  // Expected status code: 201
  // Expected behavior: the model is generated from exactly these measurements, stored under the
  //   user's avatars/ folder, and its key is saved on the user
  // Expected output: { downloadUrl, contentType: "model/gltf-binary" }
  test('Generates, stores and saves the avatar', async () => {
    const storage = mockStorage();
    const user = await createUser();

    const response = await createAvatar(user.id);

    expect(response.status).toBe(201);
    expect(exportAvatar).toHaveBeenCalledWith(MEASUREMENTS);
    const [key, body, contentType] = storage.uploadFile.mock.calls[0] ?? [];
    expect(key).toMatch(/^avatars\/[0-9a-f]{24}\/[0-9a-f-]{36}\.glb$/);
    expect(key?.startsWith(`avatars/${user.id}/`)).toBe(true);
    expect(body).toBe(GLB);
    expect(contentType).toBe('model/gltf-binary');
    expect(response.body).toEqual({ downloadUrl: `https://storage.test/${key}?sig=test`, contentType: 'model/gltf-binary' });
    expect((await User.findById(user.id))?.avatarModelKey).toBe(key);
  });

  // Mocked behavior: generation and storage succeed
  // Input: valid measurements from a user who already has an avatar
  // Expected status code: 201
  // Expected behavior: the new model replaces the old one on the user, and the old model is deleted
  // Expected output: a download link for the new model
  test('Replaces the previous avatar', async () => {
    const storage = mockStorage();
    const user = await createUser();
    const oldKey = `avatars/${user.id}/old.glb`;
    await User.updateOne({ _id: user.id }, { avatarModelKey: oldKey });

    const response = await createAvatar(user.id);

    expect(response.status).toBe(201);
    const newKey = storage.uploadFile.mock.calls[0]?.[0];
    expect((await User.findById(user.id))?.avatarModelKey).toBe(newKey);
    expect(storage.deleteFile).toHaveBeenCalledWith(oldKey);
  });

  // Mocked behavior: generation and storage succeed, but deleting the old model fails
  // Input: valid measurements from a user who already has an avatar
  // Expected status code: 201
  // Expected behavior: the new avatar is saved anyway; the clean-up failure is only logged
  // Expected output: a download link for the new model
  test('Old avatar clean-up failure is logged, not reported', async () => {
    mockStorage({ deleteError: new Error('Forced delete error') });
    const user = await createUser();
    await User.updateOne({ _id: user.id }, { avatarModelKey: `avatars/${user.id}/old.glb` });

    const response = await createAvatar(user.id);

    expect(response.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not delete old avatar model/), expect.any(Error));
  });

  // Mocked behavior: storage is available
  // Input: valid measurements with a token for a user that doesn't exist
  // Expected status code: 404
  // Expected behavior: no model is generated or stored
  // Expected output: { error: "User not found" }
  test('User not found', async () => {
    const storage = mockStorage();

    const response = await createAvatar(UNKNOWN_ID);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'User not found' });
    expect(exportAvatar).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  // Mocked behavior: the generator throws
  // Input: valid measurements
  // Expected status code: 500
  // Expected behavior: nothing is stored; the user's avatar is unchanged
  // Expected output: { error: "Internal server error" }
  test('Generation fails', async () => {
    exportAvatar.mockRejectedValue(new Error('Forced generation error'));
    const storage = mockStorage();
    const user = await createUser();

    const response = await createAvatar(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect((await User.findById(user.id))?.avatarModelKey).toBeNull();
  });

  // Mocked behavior: storage rejects the upload
  // Input: valid measurements
  // Expected status code: 500
  // Expected behavior: the user's avatar is unchanged
  // Expected output: { error: "Internal server error" }
  test('Storage upload fails', async () => {
    mockStorage({ uploadError: new Error('Forced storage error') });
    const user = await createUser();

    const response = await createAvatar(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect((await User.findById(user.id))?.avatarModelKey).toBeNull();
  });

  // Mocked behavior: generation and storage succeed, but saving the user throws a database error
  // Input: valid measurements
  // Expected status code: 500
  // Expected behavior: the stored model is deleted again so no orphaned file is left behind
  // Expected output: { error: "Internal server error" }
  test('Database error removes the stored model', async () => {
    const storage = mockStorage();
    const user = await createUser();
    jest.spyOn(User.prototype, 'save').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await createAvatar(user.id);

    expect(response.status).toBe(500);
    const storedKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(storage.deleteFile).toHaveBeenCalledWith(storedKey);
  });

  // Mocked behavior: saving the user fails and deleting the stored model also fails
  // Input: valid measurements
  // Expected status code: 500
  // Expected behavior: the database error is reported; the clean-up failure is only logged
  // Expected output: { error: "Internal server error" }
  test('Clean-up failure is logged, not reported', async () => {
    mockStorage({ deleteError: new Error('Forced delete error') });
    const user = await createUser();
    jest.spyOn(User.prototype, 'save').mockImplementation(() => {
      throw new Error('Forced database error');
    });

    const response = await createAvatar(user.id);

    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not delete orphaned avatar model/), expect.any(Error));
  });
});
