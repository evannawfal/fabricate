import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { ClothingItem } from '../../src/models/clothingItem.js';
import {
  ClassifierUnavailableError,
  setClothingClassifier,
  UnclassifiablePhotoError,
  type ClothingClassification,
  type ClothingClassifier,
} from '../../src/services/classifier.js';
import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import {
  clearTestDatabase,
  DATABASE_SETUP_TIMEOUT_MS,
  startTestDatabase,
  stopTestDatabase,
} from '../helpers/database.js';
import { authHeader, createUser } from '../helpers/fixtures.js';

const app = createApp();

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
// Different bytes, so tests can tell the two photos apart.
const BACK_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x42, 0x41, 0x43, 0x4b]);
const JACKET: ClothingClassification = { name: 'Washed denim jacket', category: 'outerwear', color: 'blue', style: 'casual' };
const KEY_PATTERN = /^clothing\/[0-9a-f]{24}\/[0-9a-f-]{36}\.jpg$/;

// Stand-ins for the photo classifier (Claude API) and file storage (Azure Blob Storage).
function mockClassifier(result: ClothingClassification | Error) {
  const classify = jest.fn<ClothingClassifier['classify']>();
  if (result instanceof Error) {
    classify.mockRejectedValue(result);
  } else {
    classify.mockResolvedValue(result);
  }
  setClothingClassifier({ classify });
  return classify;
}

// failUploadNumber: the upload that fails (1 = front photo, 2 = back photo).
function mockStorage(options: { failUploadNumber?: number; deleteError?: Error } = {}) {
  let uploads = 0;
  const storage = {
    uploadFile: jest.fn<FileStorage['uploadFile']>(() => {
      uploads += 1;
      return uploads === options.failUploadNumber ? Promise.reject(new Error('Forced storage error')) : Promise.resolve();
    }),
    downloadFile: jest.fn<FileStorage['downloadFile']>(() => Promise.resolve(new Uint8Array())),
    getDownloadUrl: jest.fn<FileStorage['getDownloadUrl']>((key) => Promise.resolve(`https://storage.test/${key}?sig=test`)),
    deleteFile: jest.fn<FileStorage['deleteFile']>(() =>
      options.deleteError ? Promise.reject(options.deleteError) : Promise.resolve()
    ),
  };
  setFileStorage(storage);
  return storage;
}

interface Photo {
  buffer?: Buffer;
  contentType?: string;
}

// Sends the front photo as `photo` and the back photo as `backPhoto`; null leaves that field out.
function upload(userId: string, front: Photo | null = {}, back: Photo | null = {}) {
  const req = request(app).post('/clothing').set('Authorization', authHeader(userId));
  if (front) {
    const contentType = front.contentType ?? 'image/jpeg';
    req.attach('photo', front.buffer ?? JPEG, { filename: `front.${contentType.split('/')[1]}`, contentType });
  }
  if (back) {
    const contentType = back.contentType ?? 'image/jpeg';
    req.attach('backPhoto', back.buffer ?? BACK_JPEG, { filename: `back.${contentType.split('/')[1]}`, contentType });
  }
  return req;
}

function loggedCleanupFailures(): number {
  return jest.mocked(console.error).mock.calls.filter(([message]) => /Could not delete orphaned photo/.test(String(message))).length;
}

beforeAll(startTestDatabase, DATABASE_SETUP_TIMEOUT_MS);
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  setClothingClassifier(undefined);
  setFileStorage(undefined);
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /clothing
describe('Mocked: POST /clothing', () => {
  // Mocked behavior: the classifier recognizes a denim jacket; storage accepts the uploads
  // Input: a JPEG front photo (`photo`) and a JPEG back photo (`backPhoto`)
  // Expected status code: 201
  // Expected behavior: both photos go to the classifier in one call, both are stored under the user's
  //   clothing/ folder with different keys, and the item is saved with both keys
  // Expected output: the new item with its classified fields and links for both photos
  test('Uploads, classifies and saves the item with both photos', async () => {
    const classify = mockClassifier(JACKET);
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ...JACKET, tags: [], isClean: true, isArchived: false });
    expect(classify).toHaveBeenCalledTimes(1);
    const [frontArg, frontType, backArg] = classify.mock.calls[0] ?? [];
    expect(Buffer.from(frontArg as Uint8Array).equals(JPEG)).toBe(true);
    expect(frontType).toBe('image/jpeg');
    expect(Buffer.from(backArg?.image as Uint8Array).equals(BACK_JPEG)).toBe(true);
    expect(backArg?.mediaType).toBe('image/jpeg');

    expect(storage.uploadFile).toHaveBeenCalledTimes(2);
    const [frontUpload, backUpload] = storage.uploadFile.mock.calls;
    const frontKey = frontUpload?.[0];
    const backKey = backUpload?.[0];
    expect(frontKey).toMatch(KEY_PATTERN);
    expect(backKey).toMatch(KEY_PATTERN);
    expect(frontKey?.startsWith(`clothing/${user.id}/`)).toBe(true);
    expect(backKey?.startsWith(`clothing/${user.id}/`)).toBe(true);
    expect(backKey).not.toBe(frontKey);
    expect(Buffer.from(frontUpload?.[1] as Uint8Array).equals(JPEG)).toBe(true);
    expect(Buffer.from(backUpload?.[1] as Uint8Array).equals(BACK_JPEG)).toBe(true);
    expect(frontUpload?.[2]).toBe('image/jpeg');
    expect(backUpload?.[2]).toBe('image/jpeg');

    expect(response.body.imageUrl).toBe(`https://storage.test/${frontKey}?sig=test`);
    expect(response.body.backImageUrl).toBe(`https://storage.test/${backKey}?sig=test`);
    const saved = await ClothingItem.findById(response.body.id);
    expect(saved?.owner.toString()).toBe(user.id);
    expect(saved?.imageKey).toBe(frontKey);
    expect(saved?.backImageKey).toBe(backKey);
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  // Mocked behavior: classification and storage succeed
  // Input: a PNG front photo and a WebP back photo, then GET /clothing
  // Expected status code: 201, then 200
  // Expected behavior: each photo keeps its own type; the new item appears in the closet with both links
  // Expected output: closet listing containing the uploaded item
  test('Uploaded item appears in the closet', async () => {
    mockClassifier({ name: 'White tee', category: 'top', color: 'white', style: 'casual' });
    const storage = mockStorage();
    const user = await createUser();

    const created = await upload(user.id, { contentType: 'image/png' }, { contentType: 'image/webp' });
    const closet = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(created.status).toBe(201);
    expect(storage.uploadFile.mock.calls[0]?.[0]).toMatch(/\.png$/);
    expect(storage.uploadFile.mock.calls[0]?.[2]).toBe('image/png');
    expect(storage.uploadFile.mock.calls[1]?.[0]).toMatch(/\.webp$/);
    expect(storage.uploadFile.mock.calls[1]?.[2]).toBe('image/webp');
    expect(closet.status).toBe(200);
    expect(closet.body.items).toHaveLength(1);
    expect(closet.body.items[0]).toMatchObject({ id: created.body.id, name: 'White tee' });
    expect(closet.body.items[0].imageUrl).toMatch(/^https:\/\/storage\.test\/clothing\/.*\.png\?/);
    expect(closet.body.items[0].backImageUrl).toMatch(/^https:\/\/storage\.test\/clothing\/.*\.webp\?/);
  });

  // Mocked behavior: classification and storage would succeed
  // Input: only the back photo, or only the front photo
  // Expected status code: 400
  // Expected behavior: nothing is classified, stored or saved
  // Expected output: an error saying which photo is missing
  test.each([
    ['front', null, {}, /Missing photo/],
    ['back', {}, null, /Missing back photo/],
  ] as const)('Missing %s photo', async (_which, front, back, expectedError) => {
    const classify = mockClassifier(JACKET);
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id, front, back);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    expect(classify).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: classification and storage would succeed
  // Input: a GIF as the front photo, then a GIF as the back photo
  // Expected status code: 400
  // Expected behavior: nothing is classified, stored or saved
  // Expected output: an error naming the unsupported photo
  test.each([
    ['front', { contentType: 'image/gif' }, {}, /Unsupported image type/],
    ['back', {}, { contentType: 'image/gif' }, /Unsupported back image type/],
  ] as const)('Unsupported %s photo type', async (_which, front, back, expectedError) => {
    const classify = mockClassifier(JACKET);
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id, front, back);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    expect(classify).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: classification and storage would succeed
  // Input: one photo over 5 MB (each photo has its own limit), the other fine
  // Expected status code: 413
  // Expected behavior: nothing is classified, stored or saved
  // Expected output: { error: "The photo must be at most 5 MB" }
  test.each([
    ['front', { buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }, {}],
    ['back', {}, { buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }],
  ] as const)('Too large %s photo', async (_which, front, back) => {
    const classify = mockClassifier(JACKET);
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id, front, back);

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'The photo must be at most 5 MB' });
    expect(classify).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: both photos are 4 MB, under the limit each
  // Input: two photos that are over 5 MB together
  // Expected status code: 201
  // Expected behavior: the limit applies per photo, not to the whole request
  test('Size limit is per photo', async () => {
    mockClassifier(JACKET);
    mockStorage();
    const user = await createUser();
    const big = Buffer.alloc(4 * 1024 * 1024, 1);

    const response = await upload(user.id, { buffer: big }, { buffer: big });

    expect(response.status).toBe(201);
  });

  // Mocked behavior: the classifier says the (front) photo isn't clothing
  // Input: a front and a back photo
  // Expected status code: 422
  // Expected behavior: neither photo is stored and no item is saved
  // Expected output: { error: "The photo does not show a clothing item" }
  test('Photo is not clothing', async () => {
    mockClassifier(new UnclassifiablePhotoError('The photo does not show a clothing item'));
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'The photo does not show a clothing item' });
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: the classification API is unavailable (e.g. rate limited or down)
  // Input: a front and a back photo
  // Expected status code: 503
  // Expected behavior: neither photo is stored and no item is saved
  // Expected output: { error: "Photo classification is not available right now" }
  test('Classifier unavailable', async () => {
    mockClassifier(new ClassifierUnavailableError('Rate limited'));
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Photo classification is not available right now' });
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: classification works but file storage isn't configured
  // Input: a front and a back photo
  // Expected status code: 503
  // Expected behavior: the photos aren't classified (no API cost) and no item is saved
  // Expected output: { error: "File storage is not available" }
  test('Storage not configured', async () => {
    const classify = mockClassifier(JACKET);
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'File storage is not available' });
    expect(classify).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: storage rejects the first (front) upload
  // Input: a front and a back photo
  // Expected status code: 500
  // Expected behavior: nothing is saved, and whatever may have been written is removed
  // Expected output: { error: "Internal server error" }
  test('Front photo upload fails', async () => {
    mockClassifier(JACKET);
    const storage = mockStorage({ failUploadNumber: 1 });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(await ClothingItem.countDocuments()).toBe(0);
    expect(storage.deleteFile).toHaveBeenCalledTimes(2);

    const deletedKeys = storage.deleteFile.mock.calls.map(([key]) => key);
    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^clothing\//),
        expect.stringMatching(/^clothing\//),
      ])
    );
  });

  // Mocked behavior: the front upload succeeds, storage rejects the back upload
  // Input: a front and a back photo
  // Expected status code: 500
  // Expected behavior: the front photo is deleted again, so no orphaned file is left and no item is saved
  // Expected output: { error: "Internal server error" }
  test('Back photo upload fails and the front photo is removed', async () => {
    mockClassifier(JACKET);
    const storage = mockStorage({ failUploadNumber: 2 });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    const frontKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(storage.deleteFile).toHaveBeenCalledWith(frontKey);
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: classification and storage succeed, but saving the item throws a database error
  // Input: a front and a back photo
  // Expected status code: 500
  // Expected behavior: both stored photos are deleted again so no orphaned file is left behind
  // Expected output: { error: "Internal server error" }
  test('Database error removes both stored photos', async () => {
    mockClassifier(JACKET);
    const storage = mockStorage();
    jest.spyOn(ClothingItem, 'create').mockImplementation(() => {
      throw new Error('Forced database error');
    });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    const uploadedKeys = storage.uploadFile.mock.calls.map(([key]) => key);
    expect(uploadedKeys).toHaveLength(2);
    expect(storage.deleteFile).toHaveBeenCalledTimes(2);
    for (const key of uploadedKeys) {
      expect(storage.deleteFile).toHaveBeenCalledWith(key);
    }
  });

  // Mocked behavior: saving fails and deleting the stored photos also fails
  // Input: a front and a back photo
  // Expected status code: 500
  // Expected behavior: the original database error is reported; each clean-up failure is only logged
  // Expected output: { error: "Internal server error" }
  test('Clean-up failure is logged, not reported', async () => {
    mockClassifier(JACKET);
    mockStorage({ deleteError: new Error('Forced delete error') });
    jest.spyOn(ClothingItem, 'create').mockImplementation(() => {
      throw new Error('Forced database error');
    });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(loggedCleanupFailures()).toBe(2);
  });

  // Mocked behavior: the item is saved, but building the response (signing the links) fails
  // Input: a front and a back photo
  // Expected status code: 201
  // Expected behavior: the item and its photos are kept; only the links are missing
  // Expected output: the item with imageUrl and backImageUrl null
  test('Failing to sign the links does not remove the saved item', async () => {
    mockClassifier(JACKET);
    const storage = mockStorage();
    storage.getDownloadUrl.mockRejectedValue(new Error('Forced signing error'));
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(201);
    expect(response.body.imageUrl).toBeNull();
    expect(response.body.backImageUrl).toBeNull();
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(await ClothingItem.countDocuments()).toBe(1);
  });
});