import { jest } from '@jest/globals';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Response } from 'express';

import { errorHandler } from '../../src/middleware/errorHandler.js';
import { getAvatarModelUrl, saveAvatarModel } from '../../src/services/avatarStorage.js';
import {
  createS3FileStorage,
  getFileStorage,
  isFileStorageConfigured,
  StorageNotConfiguredError,
  type FileStorage,
} from '../../src/services/storage.js';
import { avatarModelKey, clothingImageKey, CONTENT_TYPES } from '../../src/services/storageKeys.js';

const CONFIG = { bucket: 'test-bucket', region: 'us-west-2' };
const USER_ID = '0123456789abcdef01234567';

// Static fake credentials: signing URLs works offline and nothing is sent to AWS.
function createClient(): S3Client {
  return new S3Client({ region: CONFIG.region, credentials: { accessKeyId: 'test-key', secretAccessKey: 'test-secret' } });
}

function mockSend(client: S3Client) {
  return jest.spyOn(client, 'send').mockResolvedValue({} as never);
}

function fakeStorage(): FileStorage & { uploadFile: jest.Mock; getDownloadUrl: jest.Mock } {
  return {
    uploadFile: jest.fn(async () => undefined),
    getDownloadUrl: jest.fn(async () => 'https://signed.example/avatar.glb'),
    deleteFile: jest.fn(async () => undefined),
  } as unknown as FileStorage & { uploadFile: jest.Mock; getDownloadUrl: jest.Mock };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('S3 file storage', () => {
  // Mocked behavior: the S3 client accepts the request
  // Input: key, bytes and content type
  // Expected behavior: one PutObject request for the configured bucket with the given data
  test('uploadFile sends the file to the bucket', async () => {
    const client = createClient();
    const send = mockSend(client);
    const storage = createS3FileStorage(CONFIG, client);
    const bytes = new Uint8Array([1, 2, 3]);

    await storage.uploadFile('avatars/u/model.glb', bytes, CONTENT_TYPES.glb);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: 'test-bucket',
      Key: 'avatars/u/model.glb',
      Body: bytes,
      ContentType: 'model/gltf-binary',
    });
  });

  // Mocked behavior: the S3 client accepts the request
  // Input: an ArrayBuffer (what GLTFExporter produces)
  // Expected behavior: the bytes are uploaded unchanged
  test('uploadFile accepts an ArrayBuffer', async () => {
    const client = createClient();
    const send = mockSend(client);
    const storage = createS3FileStorage(CONFIG, client);

    await storage.uploadFile('avatars/u/model.glb', new Uint8Array([9, 8]).buffer, CONTENT_TYPES.glb);

    const body = (send.mock.calls[0]?.[0] as PutObjectCommand).input.Body as Uint8Array;
    expect(Array.from(body)).toEqual([9, 8]);
  });

  // Mocked behavior: the S3 client rejects the upload
  // Input: key and bytes
  // Expected behavior: the error is passed on to the caller
  test('uploadFile reports storage errors', async () => {
    const client = createClient();
    jest.spyOn(client, 'send').mockRejectedValue(new Error('AccessDenied') as never);
    const storage = createS3FileStorage(CONFIG, client);

    await expect(storage.uploadFile('clothing/u/a.jpg', new Uint8Array([1]), CONTENT_TYPES.jpg)).rejects.toThrow('AccessDenied');
  });

  // Mocked behavior: the S3 client accepts the request
  // Input: key
  // Expected behavior: one DeleteObject request for that key
  test('deleteFile removes the file', async () => {
    const client = createClient();
    const send = mockSend(client);
    const storage = createS3FileStorage(CONFIG, client);

    await storage.deleteFile('clothing/u/a.jpg');

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({ Bucket: 'test-bucket', Key: 'clothing/u/a.jpg' });
  });

  // Input: key, default expiry
  // Expected behavior: a signed, private-bucket URL that expires after one hour
  test('getDownloadUrl returns a signed URL', async () => {
    const storage = createS3FileStorage(CONFIG, createClient());

    const url = new URL(await storage.getDownloadUrl('avatars/u/model.glb'));

    expect(url.hostname).toBe('test-bucket.s3.us-west-2.amazonaws.com');
    expect(url.pathname).toBe('/avatars/u/model.glb');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  // Input: S3-compatible endpoint (e.g. MinIO or Google Cloud Storage) with path-style URLs, custom expiry
  // Expected behavior: the URL points at that endpoint and uses the requested expiry
  test('getDownloadUrl works with S3-compatible endpoints', async () => {
    // Credentials come from the environment, as they do on the server.
    const saved = { id: process.env.AWS_ACCESS_KEY_ID, secret: process.env.AWS_SECRET_ACCESS_KEY };
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    try {
      const storage = createS3FileStorage({ ...CONFIG, endpoint: 'http://localhost:9000', forcePathStyle: true });

      const url = new URL(await storage.getDownloadUrl('clothing/u/a.jpg', 300));

      expect(url.origin).toBe('http://localhost:9000');
      expect(url.pathname).toBe('/test-bucket/clothing/u/a.jpg');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    } finally {
      restoreEnv('AWS_ACCESS_KEY_ID', saved.id);
      restoreEnv('AWS_SECRET_ACCESS_KEY', saved.secret);
    }
  });

  // Input: expiry of 0 seconds, more than 7 days, or not a whole number
  // Expected behavior: rejected before any URL is signed
  test.each([0, 7 * 24 * 60 * 60 + 1, 1.5])('getDownloadUrl rejects expiry %p', async (expiresIn) => {
    const storage = createS3FileStorage(CONFIG, createClient());

    await expect(storage.getDownloadUrl('avatars/u/model.glb', expiresIn)).rejects.toThrow(RangeError);
  });

  // Input: empty, absolute, or path-traversal keys
  // Expected behavior: rejected without contacting storage
  test.each(['', '/avatars/x.glb', 'avatars/../secrets', 'avatars//x.glb'])('rejects invalid key %p', async (key) => {
    const client = createClient();
    const send = mockSend(client);
    const storage = createS3FileStorage(CONFIG, client);

    await expect(storage.uploadFile(key, new Uint8Array([1]), CONTENT_TYPES.glb)).rejects.toThrow('Invalid storage key');
    await expect(storage.deleteFile(key)).rejects.toThrow('Invalid storage key');
    await expect(storage.getDownloadUrl(key)).rejects.toThrow('Invalid storage key');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('App-wide file storage configuration', () => {
  // Input: no S3_BUCKET / AWS_REGION configured (as in tests and fresh clones)
  // Expected behavior: storage reports itself as not configured instead of failing at startup
  test('Not configured', () => {
    expect(isFileStorageConfigured()).toBe(false);
    expect(() => getFileStorage()).toThrow(StorageNotConfiguredError);
  });

  // Input: StorageNotConfiguredError reaching the error handler
  // Expected status code: 503
  // Expected output: { error: "File storage is not available" }
  test('Reported to the app as 503', () => {
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) } as unknown as Response;

    errorHandler(new StorageNotConfiguredError(), {} as never, res, () => undefined);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: 'File storage is not available' });
  });
});

describe('Storage keys', () => {
  // Input: a user id
  // Expected behavior: keys are grouped by feature and user, and unique per upload
  test('Keys are namespaced and unique', () => {
    const first = avatarModelKey(USER_ID);
    const second = avatarModelKey(USER_ID);

    expect(first).toMatch(new RegExp(`^avatars/${USER_ID}/[0-9a-f-]{36}\\.glb$`));
    expect(second).not.toBe(first);
    expect(clothingImageKey(USER_ID, 'png')).toMatch(new RegExp(`^clothing/${USER_ID}/[0-9a-f-]{36}\\.png$`));
  });
});

describe('Avatar model storage', () => {
  // Mocked behavior: storage accepts the upload
  // Input: user id and generated .glb bytes
  // Expected behavior: uploaded under the user's avatars/ folder as a glb model
  // Expected output: the storage key to save on the user
  test('saveAvatarModel uploads the model and returns its key', async () => {
    const storage = fakeStorage();
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

    const key = await saveAvatarModel(USER_ID, glb, storage);

    expect(key).toMatch(new RegExp(`^avatars/${USER_ID}/.+\\.glb$`));
    expect(storage.uploadFile).toHaveBeenCalledWith(key, glb, 'model/gltf-binary');
  });

  // Mocked behavior: storage signs a URL
  // Input: an avatar's storage key
  // Expected output: the signed download URL for the app
  test('getAvatarModelUrl returns a download link', async () => {
    const storage = fakeStorage();

    const url = await getAvatarModelUrl('avatars/u/model.glb', storage);

    expect(url).toBe('https://signed.example/avatar.glb');
    expect(storage.getDownloadUrl).toHaveBeenCalledWith('avatars/u/model.glb');
  });

  // Input: no file storage configured
  // Expected behavior: saving fails with StorageNotConfiguredError (reported as 503)
  test('saveAvatarModel without storage configured', async () => {
    await expect(saveAvatarModel(USER_ID, new Uint8Array([1]))).rejects.toThrow(StorageNotConfiguredError);
  });
});
