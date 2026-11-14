import type { AvatarBounds, AvatarInput, AvatarParameters, Vec3 } from "../types.js";

export type BodyPartName =
  | "head"
  | "torso"
  | "leftArm"
  | "rightArm"
  | "upperLegs"
  | "lowerLegs";

export const BODY_PARTS: readonly BodyPartName[] = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "upperLegs",
  "lowerLegs",
] as const;

export interface PartVisualMetadata {
  name: BodyPartName;
  displayName: string;
  color: number;
  description: string;
  coveredBy: ("top" | "bottom" | "outerwear")[];
}

export const PART_METADATA: Record<BodyPartName, PartVisualMetadata> = {
  head: {
    name: "head",
    displayName: "Head & Neck",
    color: 0x9b5de5, // Lavender purple
    description: "Head and neck. Anchor for tops/collars; remains visible when clothed.",
    coveredBy: [],
  },
  torso: {
    name: "torso",
    displayName: "Torso (Chest & Waist)",
    color: 0xf15bb5, // Pink / Coral
    description: "Shoulders, chest, and waist. Covered by shirts, t-shirts, dresses, and jackets.",
    coveredBy: ["top", "outerwear"],
  },
  leftArm: {
    name: "leftArm",
    displayName: "Left Arm",
    color: 0x00bbf9, // Cyan / Teal
    description: "Left shoulder joint, upper arm, forearm, and hand. Covered by long sleeves/hoodies.",
    coveredBy: ["top", "outerwear"],
  },
  rightArm: {
    name: "rightArm",
    displayName: "Right Arm",
    color: 0x00f5d4, // Mint
    description: "Right shoulder joint, upper arm, forearm, and hand. Covered by long sleeves/hoodies.",
    coveredBy: ["top", "outerwear"],
  },
  upperLegs: {
    name: "upperLegs",
    displayName: "Upper Legs (Hips & Thighs)",
    color: 0xfee440, // Gold / Amber
    description: "Pelvis and thighs down to the knees. Covered by shorts, pants, skirts, and dresses.",
    coveredBy: ["bottom"],
  },
  lowerLegs: {
    name: "lowerLegs",
    displayName: "Lower Legs & Feet",
    color: 0xff9f1c, // Orange
    description: "Knees, shins, ankles, and feet. Exposed with shorts/skirts; covered by pants.",
    coveredBy: ["bottom"],
  },
};

export interface SegmentedMeshDetails {
  name: BodyPartName;
  displayName: string;
  vertexCount: number;
  triangleCount: number;
  bounds: AvatarBounds;
}
