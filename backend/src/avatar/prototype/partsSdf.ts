import {
  DEFAULT_AVATAR_PARAMS,
  LEG_REACH,
  sdCapsule,
  sdEllipsoid,
  sdRoundedBox,
  smoothMin,
} from "../sdf.js";
import type { AvatarBounds, AvatarParameters, Vec3 } from "../types.js";
import type { BodyPartName } from "./types.js";

const HEAD_PARAMS = {
  xRatio: 0.36,
  yRatio: 0.36, //0.50,
  zRatio: 0.36, // 0.37,
};

const NECK_PARAMS = {
  radiusToWidth: 0.25,
};

const SHOULDER_PARAMS = {
  xToWidth: 0.50,
  yToWidth: 0.17,
  zToWidth: 0.20,
};

const CHEST_PARAMS = {
  xToWidth: 0.50,
  yToWidth: 0.32,
  zToWidth: 0.27,
};

const WAIST_PARAMS = {
  xToWidth: 0.50,
  yToHeight: 0.125,
  zToDepth: 0.82,
};

const ARMS_PARAMS = {
  upperLengthToArmLength: 0.52,
  upperRadiusToArmLength: 0.072,
  handLengthToArmLength: 0.05,
  handRadiusToArmLength: 0.075,
  shoulderXToShoulderWidth: 0.46,
  armToBodyAngleRad: (40 * Math.PI) / 180,
  forearmToBodyAngleRad: (30 * Math.PI) / 180,
  shoulderJoinY: 0.99,
};

const LEGS_PARAMS = {
  upperLengthToLegLength: 0.53,
  upperRadiusToLegLength: 0.078, // keep in sync with sdf.ts
  lowerRadiusToLegLength: 0.069, // keep in sync with sdf.ts
  hipStart: 0.26,
  upperLegToVerticleRad: (2 * Math.PI) / 180,
  lowerLegToVerticleRad: (2 * Math.PI) / 180,
  foot: {
    toHeight: {
      x: 0.035,
      y: 0.025,
      z: 0.070,
    },
  },
};

/**
 * Head and Neck SDF.
 * Extends slightly into the shoulder region so there are no seams when clothed.
 */
export function headSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters
): number {
  const h = p.height;
  const headY = h * 0.925;
  const neckTop = headY - p.headHeight * 0.48;
  const neckBottom = h * 0.79; // Slightly lower than 0.815 so it overlaps the chest
  const neckRadius = p.neckWidth * NECK_PARAMS.radiusToWidth;
  const blend = 0.055 * (h / 1.75);

  const head = sdEllipsoid(
    x,
    y,
    z,
    [0, headY, 0],
    [
      p.headHeight * HEAD_PARAMS.xRatio,
      p.headHeight * HEAD_PARAMS.yRatio,
      p.headHeight * HEAD_PARAMS.zRatio,
    ]
  );

  const neck = sdCapsule(
    x,
    y,
    z,
    [0, neckBottom, 0],
    [0, neckTop, 0],
    neckRadius
  );

  return smoothMin(head, neck, blend);
}

/**
 * Torso (Shoulders, Chest, and Waist) SDF.
 */
export function torsoSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters
): number {
  const h = p.height;
  const shoulderY = h * 0.80;
  const chestY = h * 0.75;
  const waistY = h * 0.65;
  const depth = 0.12 * (h / 1.75);
  const blend = 0.055 * (h / 1.75);

  const shoulders = sdEllipsoid(
    x,
    y,
    z,
    [0, shoulderY, 0],
    [
      p.shoulderWidth * SHOULDER_PARAMS.xToWidth,
      p.shoulderWidth * SHOULDER_PARAMS.yToWidth,
      p.shoulderWidth * SHOULDER_PARAMS.zToWidth,
    ]
  );

  const chest = sdEllipsoid(
    x,
    y,
    z,
    [0, chestY, 0],
    [
      p.chestWidth * CHEST_PARAMS.xToWidth,
      p.chestWidth * CHEST_PARAMS.yToWidth,
      p.chestWidth * CHEST_PARAMS.zToWidth,
    ]
  );

  const waist = sdEllipsoid(
    x,
    y,
    z,
    [0, waistY, 0],
    [
      p.waistWidth * WAIST_PARAMS.xToWidth,
      h * WAIST_PARAMS.yToHeight,
      depth * WAIST_PARAMS.zToDepth,
    ]
  );

  let d = smoothMin(shoulders, chest, blend);
  d = smoothMin(d, waist, blend);
  return d;
}

/**
 * Single arm SDF (side: -1 for left, 1 for right).
 */
export function armSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters,
  side: -1 | 1
): number {
  const h = p.height;
  const shoulderY = h * 0.80;
  const armLength = p.armLengthRatio * h;
  const upperLength = armLength * ARMS_PARAMS.upperLengthToArmLength;
  const forearmLength = armLength * (1.0 - ARMS_PARAMS.upperLengthToArmLength);
  const upperRadius = armLength * ARMS_PARAMS.upperRadiusToArmLength;
  const forearmRadius = upperRadius;
  const handLength = armLength * ARMS_PARAMS.handLengthToArmLength;
  const handRadius = armLength * ARMS_PARAMS.handRadiusToArmLength;
  const blend = 0.055 * (h / 1.75);

  const shoulderX = side * p.shoulderWidth * ARMS_PARAMS.shoulderXToShoulderWidth;
  const elbowX =
    side *
    (p.shoulderWidth * ARMS_PARAMS.shoulderXToShoulderWidth +
      upperLength * Math.sin(ARMS_PARAMS.armToBodyAngleRad));
  const wristX = elbowX + side * forearmLength * Math.sin(ARMS_PARAMS.forearmToBodyAngleRad);

  const shoulder: Vec3 = [shoulderX, shoulderY * ARMS_PARAMS.shoulderJoinY, 0];
  const elbow: Vec3 = [
    elbowX,
    shoulder[1] - upperLength * Math.cos(ARMS_PARAMS.armToBodyAngleRad) * 0.95,
    0,
  ];
  const wrist: Vec3 = [
    wristX,
    elbow[1] - forearmLength * Math.cos(ARMS_PARAMS.forearmToBodyAngleRad) * 0.95,
    0,
  ];
  const handEnd: Vec3 = [wristX, wrist[1] - handLength, 0];

  const upperArm = sdCapsule(x, y, z, shoulder, elbow, upperRadius);
  const forearm = sdCapsule(x, y, z, elbow, wrist, forearmRadius);
  const hand = sdCapsule(x, y, z, wrist, handEnd, handRadius);

  let d = smoothMin(upperArm, forearm, blend * 0.2);
  d = smoothMin(d, hand, blend * 0.2);
  return d;
}

/**
 * Upper legs (Pelvis and Thighs down to the knees) SDF.
 */
export function upperLegsSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters
): number {
  const h = p.height;
  const waistY = h * 0.65;
  const legLength = p.legLengthRatio * h;
  const upperLength = legLength * LEGS_PARAMS.upperLengthToLegLength;
  const upperRadius = legLength * LEGS_PARAMS.upperRadiusToLegLength;
  const blend = 0.055 * (h / 1.75);

  let thighs = Infinity;
  for (const side of [-1, 1] as const) {
    const hipX = side * p.hipWidth * LEGS_PARAMS.hipStart;
    const kneeX = hipX + side * Math.sin(LEGS_PARAMS.upperLegToVerticleRad) * upperLength;
    const hip: Vec3 = [hipX, waistY - h * WAIST_PARAMS.yToHeight * 0.80, 0];
    const knee: Vec3 = [
      kneeX,
      hip[1] - upperLength * Math.cos(LEGS_PARAMS.upperLegToVerticleRad) * LEG_REACH,
      0,
    ];
    const thigh = sdCapsule(x, y, z, hip, knee, upperRadius);
    thighs = Math.min(thighs, thigh);
  }

  // Cross-pelvis connector between hips
  const pelvisRadius = upperRadius * 0.95;
  const hipLeft: Vec3 = [-p.hipWidth * LEGS_PARAMS.hipStart, waistY - h * WAIST_PARAMS.yToHeight * 0.80, 0];
  const hipRight: Vec3 = [p.hipWidth * LEGS_PARAMS.hipStart, waistY - h * WAIST_PARAMS.yToHeight * 0.80, 0];
  const pelvis = sdCapsule(x, y, z, hipLeft, hipRight, pelvisRadius);

  return smoothMin(pelvis, thighs, blend * 0.4);
}

/**
 * Lower legs (Knees, Shins, Ankles, and Feet) SDF.
 */
export function lowerLegsSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters
): number {
  const h = p.height;
  const waistY = h * 0.65;
  const legLength = p.legLengthRatio * h;
  const upperLength = legLength * LEGS_PARAMS.upperLengthToLegLength;
  const lowerLength = legLength - upperLength;
  const lowerRadius = legLength * LEGS_PARAMS.lowerRadiusToLegLength;
  const blend = 0.055 * (h / 1.75);

  let legs = Infinity;
  for (const side of [-1, 1] as const) {
    const hipX = side * p.hipWidth * LEGS_PARAMS.hipStart;
    const kneeX = hipX + side * Math.sin(LEGS_PARAMS.upperLegToVerticleRad) * upperLength;
    const ankleX = kneeX + side * Math.sin(LEGS_PARAMS.lowerLegToVerticleRad) * lowerLength;

    const hip: Vec3 = [hipX, waistY - h * WAIST_PARAMS.yToHeight * 0.80, 0];
    const knee: Vec3 = [
      kneeX,
      hip[1] - upperLength * Math.cos(LEGS_PARAMS.upperLegToVerticleRad) * LEG_REACH,
      0,
    ];
    const ankle: Vec3 = [
      ankleX,
      knee[1] - lowerLength * Math.cos(LEGS_PARAMS.lowerLegToVerticleRad) * LEG_REACH,
      0,
    ];

    const shin = sdCapsule(x, y, z, knee, ankle, lowerRadius);
    const foot = sdRoundedBox(
      x,
      y,
      z,
      [ankle[0], ankle[1] - h * 0.025, h * 0.030],
      [
        h * LEGS_PARAMS.foot.toHeight.x,
        h * LEGS_PARAMS.foot.toHeight.y,
        h * LEGS_PARAMS.foot.toHeight.z,
      ],
      h * 0.025
    );

    const legPart = smoothMin(shin, foot, blend * 0.1);
    legs = Math.min(legs, legPart);
  }

  return legs;
}

/**
 * Returns the SDF evaluator for a specific body part.
 */
export function getPartSDF(
  part: BodyPartName,
  p: AvatarParameters
): (x: number, y: number, z: number) => number {
  switch (part) {
    case "head":
      return (x, y, z) => headSDF(x, y, z, p);
    case "torso":
      return (x, y, z) => torsoSDF(x, y, z, p);
    case "leftArm":
      return (x, y, z) => armSDF(x, y, z, p, -1);
    case "rightArm":
      return (x, y, z) => armSDF(x, y, z, p, 1);
    case "upperLegs":
      return (x, y, z) => upperLegsSDF(x, y, z, p);
    case "lowerLegs":
      return (x, y, z) => lowerLegsSDF(x, y, z, p);
  }
}

/**
 * Computes tight bounding boxes for each body part, drastically accelerating
 * sampling and polygonization.
 */
export function getPartBounds(
  part: BodyPartName,
  p: AvatarParameters
): AvatarBounds {
  const h = p.height;
  const pad = 0.04;

  switch (part) {
    case "head": {
      const headY = h * 0.925;
      const rx = p.headHeight * HEAD_PARAMS.xRatio + pad;
      const ry = p.headHeight * HEAD_PARAMS.yRatio + pad;
      const rz = p.headHeight * HEAD_PARAMS.zRatio + pad;
      return {
        minX: -rx,
        maxX: rx,
        minY: h * 0.77 - pad,
        maxY: headY + ry,
        minZ: -rz,
        maxZ: rz,
      };
    }
    case "torso": {
      const halfWidth = Math.max(p.shoulderWidth, p.chestWidth, p.waistWidth) / 2 + pad;
      const depth = 0.12 * (h / 1.75) + pad;
      return {
        minX: -halfWidth,
        maxX: halfWidth,
        minY: h * 0.50 - pad,
        maxY: h * 0.85 + pad,
        minZ: -depth,
        maxZ: depth,
      };
    }
    case "leftArm": {
      const armLength = p.armLengthRatio * h;
      const startX = -p.shoulderWidth * 0.46;
      const endX = startX - armLength * 0.6;
      return {
        minX: endX - pad * 2,
        maxX: startX + pad,
        minY: h * 0.45 - pad,
        maxY: h * 0.83 + pad,
        minZ: -pad * 2,
        maxZ: pad * 2,
      };
    }
    case "rightArm": {
      const armLength = p.armLengthRatio * h;
      const startX = p.shoulderWidth * 0.46;
      const endX = startX + armLength * 0.6;
      return {
        minX: startX - pad,
        maxX: endX + pad * 2,
        minY: h * 0.45 - pad,
        maxY: h * 0.83 + pad,
        minZ: -pad * 2,
        maxZ: pad * 2,
      };
    }
    case "upperLegs": {
      const halfWidth = (p.hipWidth * LEGS_PARAMS.hipStart) + (p.legLengthRatio * h * 0.12) + pad;
      const waistY = h * 0.65;
      const hipY = waistY - h * WAIST_PARAMS.yToHeight * 0.80;
      const legLength = p.legLengthRatio * h;
      const upperLength = legLength * LEGS_PARAMS.upperLengthToLegLength;
      const upperRadius = legLength * LEGS_PARAMS.upperRadiusToLegLength;
      return {
        minX: -halfWidth,
        maxX: halfWidth,
        // knee = hipY - upperLength * LEG_REACH; include the thigh radius around it
        minY: hipY - upperLength * LEG_REACH - upperRadius - pad,
        maxY: waistY + pad,
        minZ: -pad * 3,
        maxZ: pad * 3,
      };
    }
    case "lowerLegs": {
      const halfWidth = (p.hipWidth * LEGS_PARAMS.hipStart) + pad * 3;
      const legLength = p.legLengthRatio * h;
      const upperLength = legLength * LEGS_PARAMS.upperLengthToLegLength;
      const kneeY = h * 0.65 - upperLength;
      return {
        minX: -halfWidth,
        maxX: halfWidth,
        minY: -0.05,
        maxY: kneeY + pad * 2,
        minZ: -pad * 2,
        maxZ: h * 0.08 + pad,
      };
    }
  }
}