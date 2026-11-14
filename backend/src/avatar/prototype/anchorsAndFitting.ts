import { DEFAULT_AVATAR_PARAMS, LEG_REACH } from "../sdf.js";
import type { AvatarParameters, Vec3 } from "../types.js";

export interface AnchorPoint {
  id: string;
  name: string;
  position: Vec3; // [x, y, z] in avatar space (meters)
  category: "top" | "bottom" | "body";
  color: number;
  description: string;
}

export interface AvatarAnchors {
  topAnchor: AnchorPoint;
  waistAnchor: AnchorPoint;
  chestAnchor: AnchorPoint;
  hipsAnchor: AnchorPoint;
  leftShoulderAnchor: AnchorPoint;
  rightShoulderAnchor: AnchorPoint;
  leftKneeAnchor: AnchorPoint;
  rightKneeAnchor: AnchorPoint;
  leftAnkleAnchor: AnchorPoint;
  rightAnkleAnchor: AnchorPoint;
}

export interface AvatarBodyDimensions {
  shoulderWidth: number;
  torsoHeight: number;
  hipWidth: number;
  fullLegLength: number;
  totalHeight: number;
}

export interface GarmentPlacementResult {
  scale: Vec3;
  position: Vec3;
  targetAnchor: AnchorPoint;
  appliedDimensions: {
    targetWidth: number;
    targetHeight: number;
  };
}

// Ease factors to ensure clothing drapes naturally over the body without clinging or ballooning
export const FIT_EASE = {
  topWidth: 1.08,    // 8% wider than shoulder width to fit comfortably
  topHemDrop: 0.08,  // shirt hem drops 8% of body height below waistline
  bottomWidth: 1.10, // 10% wider than hip width for mobility
  bottomHemDrop: 0.02, // pants extend down to ankle level
};

/**
 * Calculates anatomical 3D anchor points on the avatar from body measurements.
 * All units are in meters with Y pointing upward and avatar origin at feet (Y=0).
 */
export function calculateAvatarAnchors(
  options: Partial<AvatarParameters> = {}
): AvatarAnchors {
  const p = { ...DEFAULT_AVATAR_PARAMS, ...options } as AvatarParameters;
  const h = p.height;

  const shoulderY = h * 0.80;
  const chestY = h * 0.75;
  const waistY = h * 0.65;
  const depth = 0.12 * (h / 1.75);

  const legLength = p.legLengthRatio * h;
  const upperLegLength = legLength * 0.53;
  const lowerLegLength = legLength - upperLegLength;

  const hipY = waistY - h * 0.125 * 0.80;
  const kneeY = hipY - upperLegLength * Math.cos((2 * Math.PI) / 180) * LEG_REACH;
  const ankleY = kneeY - lowerLegLength * Math.cos((2 * Math.PI) / 180) * LEG_REACH;

  const leftHipX = -p.hipWidth * 0.26;
  const rightHipX = p.hipWidth * 0.26;

  const shoulderXOffset = p.shoulderWidth * 0.46;

  return {
    topAnchor: {
      id: "topAnchor",
      name: "Top Anchor (Collar / Neck Base)",
      position: [0, shoulderY, 0],
      category: "top",
      color: 0x60a5fa, // Light blue
      description: "Base of neck and shoulder seam line. Tops (shirts, hoodies) snap their collar opening here.",
    },
    waistAnchor: {
      id: "waistAnchor",
      name: "Waist Anchor (Beltline / Waistband)",
      position: [0, waistY, 0],
      category: "bottom",
      color: 0xf59e0b, // Amber
      description: "Natural waistline. Bottoms (pants, shorts, skirts) snap their waistband here.",
    },
    chestAnchor: {
      id: "chestAnchor",
      name: "Chest Center",
      position: [0, chestY, depth * 0.7],
      category: "body",
      color: 0xec4899, // Pink
      description: "Mid-chest projection point.",
    },
    hipsAnchor: {
      id: "hipsAnchor",
      name: "Pelvis / Hips Center",
      position: [0, hipY, 0],
      category: "body",
      color: 0x10b981, // Emerald
      description: "Center of hip joints.",
    },
    leftShoulderAnchor: {
      id: "leftShoulderAnchor",
      name: "Left Shoulder Pivot",
      position: [-shoulderXOffset, shoulderY * 0.99, 0],
      category: "top",
      color: 0x38bdf8,
      description: "Left shoulder sleeve seam.",
    },
    rightShoulderAnchor: {
      id: "rightShoulderAnchor",
      name: "Right Shoulder Pivot",
      position: [shoulderXOffset, shoulderY * 0.99, 0],
      category: "top",
      color: 0x38bdf8,
      description: "Right shoulder sleeve seam.",
    },
    leftKneeAnchor: {
      id: "leftKneeAnchor",
      name: "Left Knee Joint",
      position: [leftHipX - 0.015, kneeY, 0],
      category: "bottom",
      color: 0xa855f7,
      description: "Left knee anchor. Shorts terminate slightly above this point.",
    },
    rightKneeAnchor: {
      id: "rightKneeAnchor",
      name: "Right Knee Joint",
      position: [rightHipX + 0.015, kneeY, 0],
      category: "bottom",
      color: 0xa855f7,
      description: "Right knee anchor. Shorts terminate slightly above this point.",
    },
    leftAnkleAnchor: {
      id: "leftAnkleAnchor",
      name: "Left Ankle / Hem",
      position: [leftHipX - 0.02, ankleY, 0],
      category: "bottom",
      color: 0x8b5cf6,
      description: "Left ankle line. Full pants terminate here.",
    },
    rightAnkleAnchor: {
      id: "rightAnkleAnchor",
      name: "Right Ankle / Hem",
      position: [rightHipX + 0.02, ankleY, 0],
      category: "bottom",
      color: 0x8b5cf6,
      description: "Right ankle line. Full pants terminate here.",
    },
  };
}

/**
 * Computes exact target anatomical body dimensions for sizing garments.
 */
export function calculateBodyDimensions(
  options: Partial<AvatarParameters> = {}
): AvatarBodyDimensions {
  const p = { ...DEFAULT_AVATAR_PARAMS, ...options } as AvatarParameters;
  const h = p.height;
  const shoulderY = h * 0.80;
  const waistY = h * 0.65;
  const bottomOfTorso = waistY - h * FIT_EASE.topHemDrop;

  // Torso height: distance from shoulder line down to below the waistline
  const torsoHeight = shoulderY - bottomOfTorso;

  // Full leg length: distance from natural waist down to ankle
  const legLength = p.legLengthRatio * h;
  const upperLegLength = legLength * 0.53;
  const lowerLegLength = legLength - upperLegLength;
  const hipY = waistY - h * 0.125 * 0.80;
  const kneeY = hipY - upperLegLength * LEG_REACH;
  const ankleY = kneeY - lowerLegLength * LEG_REACH;
  const fullLegLength = waistY - ankleY;

  return {
    shoulderWidth: p.shoulderWidth,
    torsoHeight,
    hipWidth: p.hipWidth,
    fullLegLength,
    totalHeight: h,
  };
}

/**
 * Sizes and aligns a garment mesh to exact user dimensions using anatomical anchor points.
 *
 * @param garmentBox Bounding box of the raw garment mesh { min: Vec3, max: Vec3, center: Vec3 }
 * @param garmentCategory "top" | "bottom" | "shorts"
 * @param options User's avatar parameters
 */
export function fitGarmentToAvatar(
  garmentBox: {
    min: Vec3;
    max: Vec3;
    center: Vec3;
    size: Vec3;
  },
  garmentCategory: "top" | "bottom" | "shorts",
  options: Partial<AvatarParameters> = {}
): GarmentPlacementResult {
  const anchors = calculateAvatarAnchors(options);
  const dims = calculateBodyDimensions(options);

  const rawWidth = garmentBox.size[0] || 1;
  const rawHeight = garmentBox.size[1] || 1;

  if (garmentCategory === "top") {
    // 1. Top: horizontal to shoulder width, vertical to torso height
    const targetWidth = dims.shoulderWidth * FIT_EASE.topWidth;
    const targetHeight = dims.torsoHeight;

    const scaleX = targetWidth / rawWidth;
    const scaleY = targetHeight / rawHeight;
    const scaleZ = scaleX; // Preserve depth proportion relative to shoulder width

    // Collar / Top edge of the garment snaps to TopAnchor
    const targetAnchor = anchors.topAnchor;
    const posX = targetAnchor.position[0] - garmentBox.center[0] * scaleX;
    const posY = targetAnchor.position[1] - garmentBox.max[1] * scaleY;
    const posZ = targetAnchor.position[2] - garmentBox.center[2] * scaleZ;

    return {
      scale: [scaleX, scaleY, scaleZ],
      position: [posX, posY, posZ],
      targetAnchor,
      appliedDimensions: { targetWidth, targetHeight },
    };
  } else {
    // 2. Bottom: horizontal to hip width, vertical to full leg length (or proportional for shorts)
    const targetWidth = dims.hipWidth * FIT_EASE.bottomWidth;
    const targetHeight =
      garmentCategory === "shorts"
        ? dims.fullLegLength * 0.48 // Shorts reach just above knees
        : dims.fullLegLength;       // Full pants reach ankles

    const scaleX = targetWidth / rawWidth;
    const scaleY = targetHeight / rawHeight;
    const scaleZ = scaleX;

    // Waistband (top edge) of pants/shorts snaps to WaistAnchor
    const targetAnchor = anchors.waistAnchor;
    const posX = targetAnchor.position[0] - garmentBox.center[0] * scaleX;
    const posY = targetAnchor.position[1] - garmentBox.max[1] * scaleY;
    const posZ = targetAnchor.position[2] - garmentBox.center[2] * scaleZ;

    return {
      scale: [scaleX, scaleY, scaleZ],
      position: [posX, posY, posZ],
      targetAnchor,
      appliedDimensions: { targetWidth, targetHeight },
    };
  }
}