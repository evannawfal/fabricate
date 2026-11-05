import { performance } from 'node:perf_hooks';
import type { Socket } from 'socket.io-client';

import { ROOM_UPDATE_LATENCY_LIMIT_MS, ROOM_UPDATES_ON_TIME_SHARE } from '../../src/config/constants.js';
import { createClothingItem } from '../helpers/fixtures.js';
import { nextEvent, useRoomSocketServer } from '../helpers/roomSockets.js';

const UPDATES_PER_KIND = 50;

const { roomWithTwoMembers } = useRoomSocketServer();

// Stops when the other member receives the event, not at the ack, which also waits for the database write.
async function timeDelivery(sender: Socket, receiver: Socket, event: string, payload: object): Promise<number> {
  const receivedAt = nextEvent(receiver, event).then(() => performance.now());
  const start = performance.now();
  const [ack, end] = await Promise.all([sender.emitWithAck(event, payload), receivedAt]);
  expect(ack).toEqual({ ok: true });
  return end - start;
}

function countOnTime(times: number[]): number {
  return times.filter((ms) => ms <= ROOM_UPDATE_LATENCY_LIMIT_MS).length;
}

function summarize(kind: string, times: number[]): string {
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * ROOM_UPDATES_ON_TIME_SHARE) - 1] ?? Number.NaN;
  return (
    `${kind}: ${countOnTime(times)}/${times.length} within ${ROOM_UPDATE_LATENCY_LIMIT_MS} ms, ` +
    `p95 ${p95.toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms, ` +
    `mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)} ms`
  );
}

// NFR: Room update latency
describe('NFR: room update latency', () => {
  // Input: two members connected to a room; one sends 50 chat messages, then 50 outfit board changes
  // Expected behavior: the other member receives every update over its own socket connection
  // Expected output: at least 95% of each kind of update arrives within 1 second
  test('Delivers 95% of room updates to the other member within 1 second', async () => {
    const { user, friend, userClient: sender, friendClient: receiver } = await roomWithTwoMembers();
    const shirt = await createClothingItem(user.id, { name: 'Shirt' });
    const jeans = await createClothingItem(friend.id, { name: 'Jeans', category: 'bottom' });
    const boards = [[shirt.id], [shirt.id, jeans.id]];

    const messageTimes: number[] = [];
    for (let i = 0; i < UPDATES_PER_KIND; i += 1) {
      messageTimes.push(await timeDelivery(sender, receiver, 'room:message', { text: `Message ${i}` }));
    }
    const outfitTimes: number[] = [];
    for (let i = 0; i < UPDATES_PER_KIND; i += 1) {
      const itemIds = boards[i % boards.length];
      outfitTimes.push(await timeDelivery(sender, receiver, 'room:outfitUpdate', { itemIds }));
    }

    console.log(
      `Room update latency, ${UPDATES_PER_KIND} of each update:\n` +
        `${summarize('Chat messages', messageTimes)}\n${summarize('Outfit updates', outfitTimes)}`
    );
    for (const times of [messageTimes, outfitTimes]) {
      expect(countOnTime(times) / times.length).toBeGreaterThanOrEqual(ROOM_UPDATES_ON_TIME_SHARE);
    }
  });
});
