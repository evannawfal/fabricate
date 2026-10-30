import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const ROOM_LIMITS = {
  nameLength: 100,
  maxFriends: 20,
  messageLength: 1000,
  recentMessages: 50,
} as const;

const roomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: ROOM_LIMITS.nameLength },
    members: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    // The shared outfit board: items from any member's closet.
    outfitItems: [{ type: Schema.Types.ObjectId, ref: 'ClothingItem' }],
  },
  { timestamps: true }
);

roomSchema.index({ members: 1, updatedAt: -1 });

export type RoomDocument = HydratedDocument<InferSchemaType<typeof roomSchema>>;

export const Room = model('Room', roomSchema);

const messageSchema = new Schema(
  {
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true, maxlength: ROOM_LIMITS.messageLength },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ room: 1, createdAt: -1 });

export type MessageDocument = HydratedDocument<InferSchemaType<typeof messageSchema>>;

export const Message = model('Message', messageSchema);

export interface MessageResponse {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Date;
}

export function toMessageResponse(message: MessageDocument): MessageResponse {
  return {
    id: message._id.toString(),
    roomId: message.room.toString(),
    senderId: message.sender.toString(),
    senderName: message.senderName,
    text: message.text,
    createdAt: message.createdAt,
  };
}
