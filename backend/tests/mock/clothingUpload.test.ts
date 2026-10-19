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
import { authHeader, createClothingItem, createUser } from '../helpers/fixtures.js';

const app = createApp();

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const JACKET: ClothingClassification = { name: 'Washed denim jacket', category: 'outerwear', color: 'blue', style: 'casual' };

// Stand-ins for the photo classifier (Claude API) and file storage (Azure Blob Storage).
function mockClassifier(result: ClothingClassification | Error) {
  const classify = jest.fn(async (_image: Uint8Array, _mediaType: string) => {
    if (result instanceof Error) throw result;
    return result;
  });
  setClothingClassifier({ classify } as ClothingClassifier);
  return classify;
}

function mockStorage(options: { uploadError?: Error; urlError?: Error } = {}) {
  const storage = {
    uploadFile: jest.fn(async (_key: string, _body: Uint8Array | ArrayBuffer, _contentType: string) => {
      if (options.uploadError) throw options.uploadError;
    }),
    getDownloadUrl: jest.fn(async (key: string) => {
      if (options.urlError) throw options.urlError;
      return `https://storage.test/${key}?sig=test`;
    }),
    deleteFile: jest.fn(async (_key: string) => undefined),
  };
  setFileStorage(storage as FileStorage);
  return storage;
}

function upload(userId: string, photo: Buffer = JPEG, contentType = 'image/jpeg') {
  return request(app)
    .post('/clothing')
    .set('Authorization', authHeader(userId))
    .attach('photo', photo, { filename: `photo.${contentType.split('/')[1]}`, contentType });
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
  // Mocked behavior: the classifier recognizes a denim jacket; storage accepts the upload
  // Input: a JPEG photo
  // Expected status code: 201
  // Expected behavior: photo is classified, stored under the user's clothing/ folder, and the item is saved
  // Expected output: the new item with its classified fields and a photo link
  test('Uploads, classifies and saves the item', async () => {
    const classify = mockClassifier(JACKET);
    const storage = mockStorage();
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ...JACKET, tags: [], isClean: true, isArchived: false });
    expect(classify).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
    const [key, body, contentType] = storage.uploadFile.mock.calls[0] ?? [];
    expect(key).toMatch(new RegExp(`^clothing/${user.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(Buffer.from(body as Uint8Array).equals(JPEG)).toBe(true);
    expect(contentType).toBe('image/jpeg');
    expect(response.body.imageUrl).toBe(`https://storage.test/${key}?sig=test`);
    const saved = await ClothingItem.findById(response.body.id);
    expect(saved?.owner.toString()).toBe(user.id);
    expect(saved?.imageKey).toBe(key);
  });

  // Mocked behavior: classification and storage succeed
  // Input: a PNG photo, then GET /clothing
  // Expected status code: 201, then 200
  // Expected behavior: the photo keeps its PNG type; the new item appears in the closet with a photo link
  // Expected output: closet listing containing the uploaded item
  test('Uploaded item appears in the closet', async () => {
    mockClassifier({ name: 'White tee', category: 'top', color: 'white', style: 'casual' });
    const storage = mockStorage();
    const user = await createUser();

    const created = await upload(user.id, JPEG, 'image/png');
    const closet = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(created.status).toBe(201);
    expect(storage.uploadFile.mock.calls[0]?.[0]).toMatch(/\.png$/);
    expect(storage.uploadFile.mock.calls[0]?.[2]).toBe('image/png');
    expect(closet.status).toBe(200);
    expect(closet.body.items).toHaveLength(1);
    expect(closet.body.items[0]).toMatchObject({ id: created.body.id, name: 'White tee' });
    expect(closet.body.items[0].imageUrl).toMatch(/^https:\/\/storage\.test\/clothing\//);
  });

  // Mocked behavior: the classifier says the photo isn't clothing
  // Input: a photo of something else
  // Expected status code: 422
  // Expected behavior: the photo is not stored and no item is saved
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
  // Input: a JPEG photo
  // Expected status code: 503
  // Expected behavior: the photo is not stored and no item is saved
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
  // Input: a JPEG photo
  // Expected status code: 503
  // Expected behavior: the photo isn't classified (no API cost) and no item is saved
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

  // Mocked behavior: storage rejects the upload
  // Input: a JPEG photo
  // Expected status code: 500
  // Expected behavior: the error is handled and no item is saved
  // Expected output: { error: "Internal server error" }
  test('Storage upload fails', async () => {
    mockClassifier(JACKET);
    mockStorage({ uploadError: new Error('Forced storage error') });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  // Mocked behavior: classification and storage succeed, but saving the item throws a database error
  // Input: a JPEG photo
  // Expected status code: 500
  // Expected behavior: the stored photo is deleted again so no orphaned file is left behind
  // Expected output: { error: "Internal server error" }
  test('Database error removes the stored photo', async () => {
    mockClassifier(JACKET);
    const storage = mockStorage();
    jest.spyOn(ClothingItem, 'create').mockImplementation(() => {
      throw new Error('Forced database error');
    });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    const uploadedKey = storage.uploadFile.mock.calls[0]?.[0];
    expect(storage.deleteFile).toHaveBeenCalledWith(uploadedKey);
  });

  // Mocked behavior: saving fails and deleting the stored photo also fails
  // Input: a JPEG photo
  // Expected status code: 500
  // Expected behavior: the original database error is reported; the clean-up failure is only logged
  // Expected output: { error: "Internal server error" }
  test('Clean-up failure is logged, not reported', async () => {
    mockClassifier(JACKET);
    const storage = mockStorage();
    storage.deleteFile.mockRejectedValue(new Error('Forced delete error') as never);
    jest.spyOn(ClothingItem, 'create').mockImplementation(() => {
      throw new Error('Forced database error');
    });
    const user = await createUser();

    const response = await upload(user.id);

    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not delete orphaned photo/), expect.any(Error));
  });
});

// Interface GET /clothing (photo links)
describe('Mocked: GET /clothing photo links', () => {
  // Mocked behavior: storage can't create a download link
  // Input: signed-in user with one item
  // Expected status code: 200
  // Expected behavior: the closet still loads; the item just has no photo link
  // Expected output: the item with imageUrl null
  test('Closet loads without photo links when storage fails', async () => {
    mockStorage({ urlError: new Error('Forced signing error') });
    const user = await createUser();
    await createClothingItem(user.id);

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].imageUrl).toBeNull();
  });
});
