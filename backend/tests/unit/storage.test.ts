import { jest } from '@jest/globals';
import { BlobClient, BlockBlobClient, ContainerClient } from '@azure/storage-blob';
import type { Response } from 'express';

import { errorHandler } from '../../src/middleware/errorHandler.js';
import { getAvatarModelUrl, saveAvatarModel } from '../../src/services/avatarStorage.js';
import {
  createBlobFileStorage,
  getFileStorage,
  isFileStorageConfigured,
  StorageNotConfiguredError,
  type FileStorage,
} from '../../src/services/storage.js';
import { avatarModelKey, clothingImageKey, CONTENT_TYPES } from '../../src/services/storageKeys.js';

const USER_ID = '0123456789abcdef01234567';
// Fake account: signing URLs works offline, and every network call below is intercepted.
const CONFIG = {
  connectionString:
    'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=dGVzdC1hY2NvdW50LWtleQ==;EndpointSuffix=core.windows.net',
  container: 'files',
};

function createStorage(): FileStorage {
  return createBlobFileStorage(CONFIG);
}

// Records which blob each call was made on, without contacting Azure.
function mockBlobCalls() {
  const uploads: { blob: string; data: unknown; options: unknown }[] = [];
  const deletes: string[] = [];
  const createContainer = jest
    .spyOn(ContainerClient.prototype, 'createIfNotExists')
    .mockResolvedValue({ succeeded: true } as never);
  const upload = jest.spyOn(BlockBlobClient.prototype, 'uploadData').mockImplementation(async function (
    this: BlockBlobClient,
    data: unknown,
    options: unknown
  ) {
    uploads.push({ blob: this.name, data, options });
    return {} as never;
  } as never);
  jest.spyOn(BlobClient.prototype, 'deleteIfExists').mockImplementation(async function (this: BlobClient) {
    deletes.push(this.name);
    return { succeeded: true } as never;
  } as never);
  return { uploads, deletes, createContainer, upload };
}

function fakeStorage(): FileStorage & { uploadFile: jest.Mock; getDownloadUrl: jest.Mock } {
  return {
    uploadFile: jest.fn(async () => undefined),
    getDownloadUrl: jest.fn(async () => 'https://signed.example/avatar.glb'),
    deleteFile: jest.fn(async () => undefined),
  } as unknown as FileStorage & { uploadFile: jest.Mock; getDownloadUrl: jest.Mock };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Azure Blob file storage', () => {
  // Mocked behavior: Azure accepts the requests
  // Input: key, bytes and content type
  // Expected behavior: the container is created if needed, then the file is uploaded with its content type
  test('uploadFile uploads the file to the container', async () => {
    const calls = mockBlobCalls();
    const bytes = new Uint8Array([1, 2, 3]);

    await createStorage().uploadFile('avatars/u/model.glb', bytes, CONTENT_TYPES.glb);

    expect(calls.createContainer).toHaveBeenCalledTimes(1);
    expect(calls.uploads).toEqual([
      { blob: 'avatars/u/model.glb', data: bytes, options: { blobHTTPHeaders: { blobContentType: 'model/gltf-binary' } } },
    ]);
  });

  // Mocked behavior: Azure accepts the requests
  // Input: two uploads through the same storage
  // Expected behavior: the container check only happens once
  test('Container is only checked once', async () => {
    const calls = mockBlobCalls();
    const storage = createStorage();

    await storage.uploadFile('clothing/u/a.jpg', new Uint8Array([1]), CONTENT_TYPES.jpg);
    await storage.uploadFile('clothing/u/b.jpg', new Uint8Array([2]), CONTENT_TYPES.jpg);

    expect(calls.createContainer).toHaveBeenCalledTimes(1);
    expect(calls.uploads.map((upload) => upload.blob)).toEqual(['clothing/u/a.jpg', 'clothing/u/b.jpg']);
  });

  // Mocked behavior: creating the container fails once, then succeeds
  // Input: two uploads
  // Expected behavior: the first upload reports the error; the second retries and succeeds
  test('Container creation is retried after a failure', async () => {
    const calls = mockBlobCalls();
    calls.createContainer.mockRejectedValueOnce(new Error('Network down') as never);
    const storage = createStorage();

    await expect(storage.uploadFile('clothing/u/a.jpg', new Uint8Array([1]), CONTENT_TYPES.jpg)).rejects.toThrow('Network down');
    await storage.uploadFile('clothing/u/a.jpg', new Uint8Array([1]), CONTENT_TYPES.jpg);

    expect(calls.createContainer).toHaveBeenCalledTimes(2);
    expect(calls.uploads).toHaveLength(1);
  });

  // Mocked behavior: Azure accepts the requests
  // Input: an ArrayBuffer (what GLTFExporter produces)
  // Expected behavior: the bytes are uploaded unchanged
  test('uploadFile accepts an ArrayBuffer', async () => {
    const calls = mockBlobCalls();

    await createStorage().uploadFile('avatars/u/model.glb', new Uint8Array([9, 8]).buffer, CONTENT_TYPES.glb);

    expect(Array.from(calls.uploads[0]?.data as Uint8Array)).toEqual([9, 8]);
  });

  // Mocked behavior: Azure rejects the upload
  // Input: key and bytes
  // Expected behavior: the error is passed on to the caller
  test('uploadFile reports storage errors', async () => {
    const calls = mockBlobCalls();
    calls.upload.mockRejectedValue(new Error('AuthorizationFailure') as never);

    await expect(createStorage().uploadFile('clothing/u/a.jpg', new Uint8Array([1]), CONTENT_TYPES.jpg)).rejects.toThrow(
      'AuthorizationFailure'
    );
  });

  // Mocked behavior: Azure accepts the request
  // Input: key
  // Expected behavior: that blob is deleted (no error if it was already gone)
  test('deleteFile removes the file', async () => {
    const calls = mockBlobCalls();

    await createStorage().deleteFile('clothing/u/a.jpg');

    expect(calls.deletes).toEqual(['clothing/u/a.jpg']);
  });

  // Input: key, default expiry
  // Expected behavior: a read-only signed URL for that blob that expires after one hour
  test('getDownloadUrl returns a signed URL', async () => {
    const before = Date.now();

    const url = new URL(await createStorage().getDownloadUrl('avatars/u/model.glb'));

    expect(url.hostname).toBe('testaccount.blob.core.windows.net');
    expect(url.pathname).toBe('/files/avatars/u/model.glb');
    expect(url.searchParams.get('sp')).toBe('r');
    expect(url.searchParams.get('sig')).toBeTruthy();
    const expiresAt = Date.parse(url.searchParams.get('se') ?? '');
    expect(expiresAt - before).toBeGreaterThan(3590 * 1000);
    expect(expiresAt - before).toBeLessThan(3610 * 1000);
  });

  // Input: key, custom expiry of 5 minutes
  // Expected behavior: the URL expires after 5 minutes
  test('getDownloadUrl uses the requested expiry', async () => {
    const before = Date.now();

    const url = new URL(await createStorage().getDownloadUrl('clothing/u/a.jpg', 300));

    const expiresAt = Date.parse(url.searchParams.get('se') ?? '');
    expect(expiresAt - before).toBeGreaterThan(290 * 1000);
    expect(expiresAt - before).toBeLessThan(310 * 1000);
  });

  // Input: expiry of 0 seconds, more than 7 days, or not a whole number
  // Expected behavior: rejected before any URL is signed
  test.each([0, 7 * 24 * 60 * 60 + 1, 1.5])('getDownloadUrl rejects expiry %p', async (expiresIn) => {
    await expect(createStorage().getDownloadUrl('avatars/u/model.glb', expiresIn)).rejects.toThrow(RangeError);
  });

  // Input: empty, absolute, or path-traversal keys
  // Expected behavior: rejected without contacting storage
  test.each(['', '/avatars/x.glb', 'avatars/../secrets', 'avatars//x.glb'])('rejects invalid key %p', async (key) => {
    const calls = mockBlobCalls();
    const storage = createStorage();

    await expect(storage.uploadFile(key, new Uint8Array([1]), CONTENT_TYPES.glb)).rejects.toThrow('Invalid storage key');
    await expect(storage.deleteFile(key)).rejects.toThrow('Invalid storage key');
    await expect(storage.getDownloadUrl(key)).rejects.toThrow('Invalid storage key');
    expect(calls.uploads).toHaveLength(0);
    expect(calls.deletes).toHaveLength(0);
  });
});

describe('App-wide file storage configuration', () => {
  // Input: no AZURE_STORAGE_CONNECTION_STRING / AZURE_STORAGE_CONTAINER configured (as in tests and fresh clones)
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
