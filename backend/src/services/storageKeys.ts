import { randomUUID } from 'node:crypto';

// Where each kind of file lives in storage. Keys are unique per upload, so a replaced
// file (e.g. a regenerated avatar) never collides with a copy the app has cached.
export const CONTENT_TYPES = {
  glb: 'model/gltf-binary',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export type ImageExtension = 'jpg' | 'png' | 'webp';

export function clothingImageKey(userId: string, extension: ImageExtension): string {
  return `clothing/${userId}/${randomUUID()}.${extension}`;
}

export function avatarModelKey(userId: string): string {
  return `avatars/${userId}/${randomUUID()}.glb`;
}
