import { BlobSASPermissions, BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { env } from '../config/env.js';

// Private file storage for clothing photos, avatar models and any other user files.
// Files are never public: the app downloads them through short-lived signed URLs.
export interface FileStorage {
  uploadFile(key: string, body: Uint8Array | ArrayBuffer, contentType: string): Promise<void>;
  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

export interface BlobStorageConfig {
  connectionString: string;
  container: string;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('File storage is not configured (set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER)');
    this.name = 'StorageNotConfiguredError';
  }
}

export const DEFAULT_DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;
// Keep signed URLs short-lived; nothing in the app needs links valid for more than a week.
const MAX_DOWNLOAD_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
// Signed URLs start slightly in the past so small clock differences don't reject them.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function assertValidKey(key: string): void {
  if (key.length === 0 || key.startsWith('/') || key.split('/').some((part) => part === '' || part === '..')) {
    throw new Error(`Invalid storage key: "${key}"`);
  }
}

export function createBlobFileStorage(config: BlobStorageConfig, containerClient?: ContainerClient): FileStorage {
  const container =
    containerClient ?? BlobServiceClient.fromConnectionString(config.connectionString).getContainerClient(config.container);

  // Creates the (private) container the first time a file is uploaded, if it doesn't exist yet.
  let containerReady: Promise<unknown> | undefined;
  function ensureContainer(): Promise<unknown> {
    containerReady ??= container.createIfNotExists().catch((err: unknown) => {
      containerReady = undefined;
      throw err;
    });
    return containerReady;
  }

  return {
    async uploadFile(key, body, contentType) {
      assertValidKey(key);
      await ensureContainer();
      const data = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
      await container.getBlockBlobClient(key).uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
    },

    async getDownloadUrl(key, expiresInSeconds = DEFAULT_DOWNLOAD_URL_EXPIRY_SECONDS) {
      assertValidKey(key);
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_DOWNLOAD_URL_EXPIRY_SECONDS) {
        throw new RangeError(`expiresInSeconds must be an integer between 1 and ${MAX_DOWNLOAD_URL_EXPIRY_SECONDS}`);
      }
      const now = Date.now();
      return container.getBlobClient(key).generateSasUrl({
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(now - CLOCK_SKEW_MS),
        expiresOn: new Date(now + expiresInSeconds * 1000),
      });
    },

    async deleteFile(key) {
      assertValidKey(key);
      await container.getBlobClient(key).deleteIfExists();
    },
  };
}

let defaultStorage: FileStorage | undefined;

export function isFileStorageConfigured(): boolean {
  return defaultStorage !== undefined || (env.storage.connectionString !== undefined && env.storage.container !== undefined);
}

// Replaces the app-wide storage (e.g. with a stand-in in tests); undefined goes back to the env-configured one.
export function setFileStorage(storage: FileStorage | undefined): void {
  defaultStorage = storage;
}

// The app-wide storage, configured from environment variables.
// Throws StorageNotConfiguredError (reported to the client as 503) if storage isn't set up.
export function getFileStorage(): FileStorage {
  if (defaultStorage === undefined) {
    const { connectionString, container } = env.storage;
    if (connectionString === undefined || container === undefined) {
      throw new StorageNotConfiguredError();
    }
    defaultStorage = createBlobFileStorage({ connectionString, container });
  }
  return defaultStorage;
}
