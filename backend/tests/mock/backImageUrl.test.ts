import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { setOutfitGenerator, type OutfitGenerator } from '../../src/services/outfitGenerator.js';
import { setFileStorage, type FileStorage } from '../../src/services/storage.js';
import { setWeatherService, type WeatherService } from '../../src/services/weather.js';
import { authHeader, createClothingItem, createOutfit, createRoom, createUser } from '../helpers/fixtures.js';
import { nextEvent, useRoomSocketServer } from '../helpers/roomSockets.js';

// Every place the app shows a clothing item must show it the same way, with a link for the back
// photo when the item has one and null when it doesn't (items added before back photos existed).
const app = createApp();
const { roomWithTwoMembers } = useRoomSocketServer();

const FRONT_KEY = 'clothing/coat-front.jpg';
const BACK_KEY = 'clothing/coat-back.jpg';
const OLD_KEY = 'clothing/test-image.jpg';

function urlFor(key: string): string {
  return `https://storage.test/${key}?sig=test`;
}

interface ItemLinks {
  name: string;
  imageUrl: string | null;
  backImageUrl: string | null;
}

// [name, front link, back link] for each item, in order.
function linksOf(items: ItemLinks[]) {
  return items.map(({ name, imageUrl, backImageUrl }) => [name, imageUrl, backImageUrl]);
}

const COAT_LINKS = ['Coat', urlFor(FRONT_KEY), urlFor(BACK_KEY)];
const OLD_SHIRT_LINKS = ['Old shirt', urlFor(OLD_KEY), null];

// Links are signed by a stand-in for file storage; failFor makes signing fail for matching keys.
function mockStorage(options: { failFor?: string } = {}) {
  const getDownloadUrl = jest.fn<FileStorage['getDownloadUrl']>((key) =>
    options.failFor !== undefined && key.includes(options.failFor)
      ? Promise.reject(new Error('Forced signing error'))
      : Promise.resolve(urlFor(key))
  );
  setFileStorage({ getDownloadUrl } as unknown as FileStorage);
  return getDownloadUrl;
}

// An item with both photos and one without a back photo. The coat is created last, so it is newest.
async function itemsFor(ownerId: string) {
  const oldShirt = await createClothingItem(ownerId, { name: 'Old shirt', imageKey: OLD_KEY });
  const coat = await createClothingItem(ownerId, {
    name: 'Coat',
    category: 'outerwear',
    imageKey: FRONT_KEY,
    backImageKey: BACK_KEY,
  });
  return { oldShirt, coat };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  setFileStorage(undefined);
  setOutfitGenerator(undefined);
  setWeatherService(undefined);
  jest.restoreAllMocks();
});

// Interfaces GET /clothing, GET /clothing/:id and PATCH /clothing/:id
describe('Mocked: backImageUrl on closet items', () => {
  // Mocked behavior: storage signs a link for every photo key
  // Input: a closet with an item that has a back photo and one that doesn't
  // Expected status code: 200
  // Expected output: imageUrl for both items; backImageUrl for the coat and null for the old shirt
  test('GET /clothing', async () => {
    mockStorage();
    const user = await createUser();
    await itemsFor(user.id);

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(linksOf(response.body.items)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
  });

  // Mocked behavior: storage signs a link for every photo key
  // Input: the id of each item
  // Expected status code: 200
  // Expected output: the item with its links, backImageUrl null when it has no back photo
  test('GET /clothing/:id', async () => {
    mockStorage();
    const user = await createUser();
    const { oldShirt, coat } = await itemsFor(user.id);

    const withBack = await request(app).get(`/clothing/${coat.id}`).set('Authorization', authHeader(user.id));
    const withoutBack = await request(app).get(`/clothing/${oldShirt.id}`).set('Authorization', authHeader(user.id));

    expect(linksOf([withBack.body])).toEqual([COAT_LINKS]);
    expect(linksOf([withoutBack.body])).toEqual([OLD_SHIRT_LINKS]);
  });

  // Mocked behavior: storage signs a link for every photo key
  // Input: a new name for each item
  // Expected status code: 200
  // Expected output: the updated item with the same links as before
  test('PATCH /clothing/:id', async () => {
    mockStorage();
    const user = await createUser();
    const { oldShirt, coat } = await itemsFor(user.id);

    const withBack = await request(app)
      .patch(`/clothing/${coat.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Coat' });
    const withoutBack = await request(app)
      .patch(`/clothing/${oldShirt.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Old shirt' });

    expect(withBack.status).toBe(200);
    expect(withoutBack.status).toBe(200);
    expect(linksOf([withBack.body])).toEqual([COAT_LINKS]);
    expect(linksOf([withoutBack.body])).toEqual([OLD_SHIRT_LINKS]);
  });

  // Mocked behavior: storage can sign the front photo's link but not the back photo's
  // Input: a closet with a coat that has both photos
  // Expected status code: 200
  // Expected behavior: the failure is logged; the front link is unaffected
  // Expected output: the coat with its imageUrl and backImageUrl null
  test('Back photo link that cannot be signed', async () => {
    mockStorage({ failFor: 'back' });
    const user = await createUser();
    await itemsFor(user.id);

    const response = await request(app).get('/clothing').set('Authorization', authHeader(user.id));

    expect(response.status).toBe(200);
    expect(linksOf(response.body.items)).toEqual([['Coat', urlFor(FRONT_KEY), null], OLD_SHIRT_LINKS]);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Could not create an image link/), expect.any(Error));
  });
});

// Interfaces POST /outfits, GET /outfits, GET /outfits/:id and PATCH /outfits/:id
describe('Mocked: backImageUrl on outfit items', () => {
  // Mocked behavior: storage signs a link for every photo key
  // Input: an outfit with both items, listed, fetched, created and updated
  // Expected status code: 200 or 201
  // Expected output: every outfit's items have the same links as in the closet, in the outfit's order
  test('Outfit endpoints', async () => {
    mockStorage();
    const user = await createUser();
    const { oldShirt, coat } = await itemsFor(user.id);
    const outfit = await createOutfit(user.id, [coat.id, oldShirt.id]);

    const list = await request(app).get('/outfits').set('Authorization', authHeader(user.id));
    const single = await request(app).get(`/outfits/${outfit.id}`).set('Authorization', authHeader(user.id));
    const created = await request(app)
      .post('/outfits')
      .set('Authorization', authHeader(user.id))
      .send({ name: 'Look', items: [oldShirt.id, coat.id] });
    const updated = await request(app)
      .patch(`/outfits/${outfit.id}`)
      .set('Authorization', authHeader(user.id))
      .send({ items: [oldShirt.id, coat.id] });

    expect(list.status).toBe(200);
    expect(linksOf(list.body.outfits[0].items)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
    expect(linksOf(single.body.items)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
    expect(created.status).toBe(201);
    expect(linksOf(created.body.items)).toEqual([OLD_SHIRT_LINKS, COAT_LINKS]);
    expect(updated.status).toBe(200);
    expect(linksOf(updated.body.items)).toEqual([OLD_SHIRT_LINKS, COAT_LINKS]);
  });
});

// Interface POST /outfits/generate
describe('Mocked: backImageUrl on generated outfit items', () => {
  // Mocked behavior: the generator picks the coat, shirt and jeans; storage signs every photo key
  // Input: occasion "casual" and coordinates
  // Expected status code: 200
  // Expected behavior: the generator is only given text details, never photos
  // Expected output: outfit.items with the same links as in the closet
  test('POST /outfits/generate', async () => {
    mockStorage();
    const user = await createUser();
    const { oldShirt, coat } = await itemsFor(user.id);
    await createClothingItem(user.id, { name: 'Jeans', category: 'bottom' });
    setWeatherService({ getCurrentWeather: jest.fn<WeatherService['getCurrentWeather']>().mockResolvedValue(null) });
    const generate = jest.fn<OutfitGenerator['generate']>().mockResolvedValue({ name: 'Look', itemIds: [coat.id, oldShirt.id] });
    setOutfitGenerator({ generate });

    const response = await request(app)
      .post('/outfits/generate')
      .set('Authorization', authHeader(user.id))
      .send({ occasion: 'casual', latitude: 49.26, longitude: -123.25 });

    expect(response.status).toBe(200);
    expect(linksOf(response.body.outfit.items)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
    for (const candidate of generate.mock.calls[0]?.[0].items ?? []) {
      expect(Object.keys(candidate).sort()).toEqual(['category', 'color', 'id', 'name', 'style', 'tags']);
    }
  });
});

// Interfaces GET /rooms/:id and POST /rooms/:id/save
describe('Mocked: backImageUrl on room items', () => {
  // Mocked behavior: storage signs a link for every photo key
  // Input: a room whose board has both items, fetched and then saved as an outfit
  // Expected status code: 200 and 201
  // Expected output: outfitItems and the saved outfit's items have the same links as in the closet
  test('Room endpoints', async () => {
    mockStorage();
    const user = await createUser();
    const { oldShirt, coat } = await itemsFor(user.id);
    const room = await createRoom('Room', [user.id], [coat.id, oldShirt.id]);

    const fetched = await request(app).get(`/rooms/${room.id}`).set('Authorization', authHeader(user.id));
    const saved = await request(app).post(`/rooms/${room.id}/save`).set('Authorization', authHeader(user.id));

    expect(fetched.status).toBe(200);
    expect(linksOf(fetched.body.outfitItems)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
    expect(saved.status).toBe(201);
    expect(linksOf(saved.body.items)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
  });
});

// Interface Socket.IO event room:outfitUpdate
describe('Mocked: backImageUrl in room:outfitUpdate', () => {
  // Mocked behavior: storage signs a link for every photo key
  // Input: { itemIds } with both items, sent by one member
  // Expected behavior: the other member receives the board
  // Expected output: items with the same links as in the closet, in the order sent
  test('Items in the update event', async () => {
    mockStorage();
    const { user, userClient, friendClient } = await roomWithTwoMembers();
    const { oldShirt, coat } = await itemsFor(user.id);
    const received = nextEvent<{ items: ItemLinks[] }>(friendClient, 'room:outfitUpdate');

    const ack = await userClient.emitWithAck('room:outfitUpdate', { itemIds: [coat.id, oldShirt.id] });

    expect(ack).toEqual({ ok: true });
    expect(linksOf((await received).items)).toEqual([COAT_LINKS, OLD_SHIRT_LINKS]);
  });
});
