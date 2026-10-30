import { ROOM_LIMITS } from '../models/room.js';
import { checkBodyFields, invalid, parseIdList, parseText, valid, type ValidationResult } from './common.js';

export interface RoomInput {
  name: string;
  friendIds: string[];
}

export function validateRoomInput(body: unknown): ValidationResult<RoomInput> {
  const fields = checkBodyFields(body, ['name', 'friendIds']);
  if (!fields.ok) return invalid(fields.error);
  const name = parseText(fields.value.name, 'name', ROOM_LIMITS.nameLength);
  if (!name.ok) return invalid(name.error);
  const friendIds = parseIdList(fields.value.friendIds, 'friendIds', ROOM_LIMITS.maxFriends);
  if (!friendIds.ok) return invalid(friendIds.error);
  return valid({ name: name.value, friendIds: friendIds.value });
}
