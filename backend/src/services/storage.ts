import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

// Private file storage for clothing photos, avatar models and any other user files.
// Files are never public: the app downloads them through short-lived signed URLs.
export interface FileStorage {
  uploadFile(key: string, body: Uint8Array | ArrayBuffer, contentType: string): Promise<void>;
  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  forcePathStyle?: boolean | undefined;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('File storage is not configured (set S3_BUCKET and AWS_REGION)');
    this.name = 'StorageNotConfiguredError';
  }
}

export const DEFAULT_DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;
// Signed URLs can't be valid for longer than 7 days.
const MAX_DOWNLOAD_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function assertValidKey(key: string): void {
  if (key.length === 0 || key.startsWith('/') || key.split('/').some((part) => part === '' || part === '..')) {
    throw new Error(`Invalid storage key: "${key}"`);
  }
}

export function createS3FileStorage(config: S3StorageConfig, client?: S3Client): FileStorage {
  const s3 =
    client ??
    new S3Client({
      region: config.region,
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? false,
    });

  return {
    async uploadFile(key, body, contentType) {
      assertValidKey(key);
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
          ContentType: contentType,
        })
      );
    },

    async getDownloadUrl(key, expiresInSeconds = DEFAULT_DOWNLOAD_URL_EXPIRY_SECONDS) {
      assertValidKey(key);
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_DOWNLOAD_URL_EXPIRY_SECONDS) {
        throw new RangeError(`expiresInSeconds must be an integer between 1 and ${MAX_DOWNLOAD_URL_EXPIRY_SECONDS}`);
      }
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },

    async deleteFile(key) {
      assertValidKey(key);
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

let defaultStorage: FileStorage | undefined;

export function isFileStorageConfigured(): boolean {
  return env.storage.bucket !== undefined && env.storage.region !== undefined;
}

// The app-wide storage, configured from environment variables.
// Throws StorageNotConfiguredError (reported to the client as 503) if storage isn't set up.
export function getFileStorage(): FileStorage {
  if (defaultStorage === undefined) {
    const { bucket, region, endpoint, forcePathStyle } = env.storage;
    if (bucket === undefined || region === undefined) {
      throw new StorageNotConfiguredError();
    }
    defaultStorage = createS3FileStorage({ bucket, region, endpoint, forcePathStyle });
  }
  return defaultStorage;
}
