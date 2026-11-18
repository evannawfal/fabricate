import type { AvatarBounds, AvatarParameters, Vec3 } from "./types.js";
import type { BodyPartName } from "./types.js";

export const LEG_REACH = 1.0;

/**
 * Default ratios 
 */
const DEFAULTS = {
  headHeight: 0.23,
  neckWidth: 0.12,
  armLengthRatio: 0.30,
  legLengthRatio: 0.50, 
  resolution: 0.015,
};

/**
 * Approximate signed distance to an ellipsoid.
 * center = [x, y, z]
 * radii  = [rx, ry, rz]
 */
export function sdEllipsoid(
  x: number,
  y: number,
  z: number,
  center: Vec3,
  radii: Vec3,
): number {
  const qx = x - center[0];
  const qy = y - center[1];
  const qz = z - center[2];
  const [rx, ry, rz] = radii;
  const k0 = Math.hypot(qx / rx, qy / ry, qz / rz);
  const k1 = Math.hypot(
    qx / (rx * rx),
    qy / (ry * ry),
    qz / (rz * rz)
  );
  if (k1 < 1e-10) {
    return -Math.min(rx, ry, rz);
  }
  return (k0 * (k0 - 1)) / k1;
}

/**
 * Approximate signed distance to a rounded box.
 * center = [x, y, z]
 * halfSize = [sx, sy, sz]
 * radii  = [rx, ry, rz]
 */
export function sdRoundedBox(
  x: number,
  y: number,
  z: number,
  center: Vec3,
  halfSize: Vec3,
  radius: number,
): number {
  const qx = Math.abs(x - center[0]) - halfSize[0] + radius;
  const qy = Math.abs(y - center[1]) - halfSize[1] + radius;
  const qz = Math.abs(z - center[2]) - halfSize[2] + radius;
  return (
    Math.hypot(
      Math.max(qx, 0),
      Math.max(qy, 0),
      Math.max(qz, 0)
    ) +
    Math.min(Math.max(qx, qy, qz), 0) -
    radius
  );
}

/**
 * Signed distance to a capsule around segment A to B.
 */
export function sdCapsule(
  x: number,
  y: number,
  z: number,
  a: Vec3,
  b: Vec3,
  radius: number,
): number {
  const pax = x - a[0];
  const pay = y - a[1];
  const paz = z - a[2];

  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const denominator = bax * bax + bay * bay + baz * baz;
  const t = denominator > 0
    ? Math.max(
        0,
        Math.min(1, (pax * bax + pay * bay + paz * baz) / denominator)
      )
    : 0;
  return Math.hypot(
    pax - bax * t,
    pay - bay * t,
    paz - baz * t
  ) - radius;
}

/**
 * Smoothly combines two SDFs.
 * Smaller k = tighter blend.
 */
export function smoothMin(
  a: number,
  b: number,
  k: number,
): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (k * h * h) / 4;
}

const HEAD_PARAMS = {
  xRatio: 0.36,
  yRatio: 0.36,
  zRatio: 0.36,
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
  upperRadiusToLegLength: 0.066, // thigh      (was 0.078)
  lowerRadiusToLegLength: 0.054, // shin/calf  (was 0.069)
  pelvisRadiusFactor: 0.95,      // pelvis connector radius relative to the thigh radius
  hipStart: 0.26,                // how far each hip joint sits from the centre line (x hipWidth)
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

type Side = -1 | 1;
export type ArmSegment = "upper" | "fore" | "hand";
export type LegSegment = "upper" | "lower" | "foot";

const PAD = 0.04;

function capsuleBounds(a: Vec3, b: Vec3, radius: number, pad = PAD): AvatarBounds {
  const r = radius + pad;
  return {
    minX: Math.min(a[0], b[0]) - r,
    maxX: Math.max(a[0], b[0]) + r,
    minY: Math.min(a[1], b[1]) - r,
    maxY: Math.max(a[1], b[1]) + r,
    minZ: Math.min(a[2], b[2]) - r,
    maxZ: Math.max(a[2], b[2]) + r,
  };
}

function boxBounds(center: Vec3, half: Vec3, pad = PAD): AvatarBounds {
  return {
    minX: center[0] - half[0] - pad,
    maxX: center[0] + half[0] + pad,
    minY: center[1] - half[1] - pad,
    maxY: center[1] + half[1] + pad,
    minZ: center[2] - half[2] - pad,
    maxZ: center[2] + half[2] + pad,
  };
}

function unionBounds(a: AvatarBounds, b: AvatarBounds): AvatarBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

interface ArmJoints {
  shoulder: Vec3;
  elbow: Vec3;
  wrist: Vec3;
  handEnd: Vec3;
  upperRadius: number;
  forearmRadius: number;
  handRadius: number;
}

function armJoints(p: AvatarParameters, side: Side): ArmJoints {
  const h = p.height;
  const shoulderY = h * 0.80;
  const armLength = p.armLengthRatio * h;
  const upperLength = armLength * ARMS_PARAMS.upperLengthToArmLength;
  const forearmLength = armLength * (1.0 - ARMS_PARAMS.upperLengthToArmLength);
  const upperRadius = armLength * ARMS_PARAMS.upperRadiusToArmLength;
  const handLength = armLength * ARMS_PARAMS.handLengthToArmLength;
  const handRadius = armLength * ARMS_PARAMS.handRadiusToArmLength;

  const shoulderX = side * p.shoulderWidth * ARMS_PARAMS.shoulderXToShoulderWidth;
  const elbowX = shoulderX + side * upperLength * Math.sin(ARMS_PARAMS.armToBodyAngleRad);
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

  return {
    shoulder,
    elbow,
    wrist,
    handEnd,
    upperRadius,
    forearmRadius: upperRadius,
    handRadius,
  };
}

interface LegJoints {
  hip: Vec3;
  knee: Vec3;
  ankle: Vec3;
  upperRadius: number;
  lowerRadius: number;
  pelvisRadius: number;
  footCenter: Vec3;
  footHalf: Vec3;
  footRadius: number;
}

function legJoints(p: AvatarParameters, side: Side): LegJoints {
  const h = p.height;
  const waistY = h * 0.65;
  const legLength = p.legLengthRatio * h;
  const upperLength = legLength * LEGS_PARAMS.upperLengthToLegLength;
  const lowerLength = legLength - upperLength;
  const upperRadius = legLength * LEGS_PARAMS.upperRadiusToLegLength;
  const lowerRadius = legLength * LEGS_PARAMS.lowerRadiusToLegLength;

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

  return {
    hip,
    knee,
    ankle,
    upperRadius,
    lowerRadius,
    pelvisRadius: upperRadius * LEGS_PARAMS.pelvisRadiusFactor,
    footCenter: [ankle[0], ankle[1] - h * 0.025, h * 0.030],
    footHalf: [
      h * LEGS_PARAMS.foot.toHeight.x,
      h * LEGS_PARAMS.foot.toHeight.y,
      h * LEGS_PARAMS.foot.toHeight.z,
    ],
    footRadius: h * 0.025,
  };
}

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
 * One segment of one arm: upper arm (shoulder to elbow), forearm (elbow to wrist) or hand.
 * side: -1 = left, 1 = right.
 */
export function armSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters,
  side: Side,
  segment: ArmSegment
): number {
  const j = armJoints(p, side);
  switch (segment) {
    case "upper":
      return sdCapsule(x, y, z, j.shoulder, j.elbow, j.upperRadius);
    case "fore":
      return sdCapsule(x, y, z, j.elbow, j.wrist, j.forearmRadius);
    case "hand":
      return sdCapsule(x, y, z, j.wrist, j.handEnd, j.handRadius);
  }
}

/**
 * One segment of one leg: upper leg (half pelvis + thigh, hip to knee),
 * lower leg (knee to ankle) or foot.
 * side: -1 = left, 1 = right.
 */
export function legSDF(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters,
  side: Side,
  segment: LegSegment
): number {
  const j = legJoints(p, side);
  switch (segment) {
    case "upper": {
      const blend = 0.055 * (p.height / 1.75);
      const thigh = sdCapsule(x, y, z, j.hip, j.knee, j.upperRadius);
      // Half of the cross-pelvis connector, so the two thighs meet at x = 0
      const pelvis = sdCapsule(x, y, z, [0, j.hip[1], 0], j.hip, j.pelvisRadius);
      return smoothMin(pelvis, thigh, blend * 0.4);
    }
    case "lower":
      return sdCapsule(x, y, z, j.knee, j.ankle, j.lowerRadius);
    case "foot":
      return sdRoundedBox(x, y, z, j.footCenter, j.footHalf, j.footRadius);
  }
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
    case "leftUpperArm":
      return (x, y, z) => armSDF(x, y, z, p, -1, "upper");
    case "leftForeArm":
      return (x, y, z) => armSDF(x, y, z, p, -1, "fore");
    case "leftHand":
      return (x, y, z) => armSDF(x, y, z, p, -1, "hand");
    case "rightUpperArm":
      return (x, y, z) => armSDF(x, y, z, p, 1, "upper");
    case "rightForeArm":
      return (x, y, z) => armSDF(x, y, z, p, 1, "fore");
    case "rightHand":
      return (x, y, z) => armSDF(x, y, z, p, 1, "hand");
    case "leftUpperLeg":
      return (x, y, z) => legSDF(x, y, z, p, -1, "upper");
    case "leftLowerLeg":
      return (x, y, z) => legSDF(x, y, z, p, -1, "lower");
    case "leftFoot":
      return (x, y, z) => legSDF(x, y, z, p, -1, "foot");
    case "rightUpperLeg":
      return (x, y, z) => legSDF(x, y, z, p, 1, "upper");
    case "rightLowerLeg":
      return (x, y, z) => legSDF(x, y, z, p, 1, "lower");
    case "rightFoot":
      return (x, y, z) => legSDF(x, y, z, p, 1, "foot");
  }
}


function armBounds(p: AvatarParameters, side: Side, segment: ArmSegment): AvatarBounds {
  const j = armJoints(p, side);
  switch (segment) {
    case "upper":
      return capsuleBounds(j.shoulder, j.elbow, j.upperRadius);
    case "fore":
      return capsuleBounds(j.elbow, j.wrist, j.forearmRadius);
    case "hand":
      return capsuleBounds(j.wrist, j.handEnd, j.handRadius);
  }
}

function legBounds(p: AvatarParameters, side: Side, segment: LegSegment): AvatarBounds {
  const j = legJoints(p, side);
  switch (segment) {
    case "upper":
      return unionBounds(
        capsuleBounds(j.hip, j.knee, j.upperRadius),
        capsuleBounds([0, j.hip[1], 0], j.hip, j.pelvisRadius)
      );
    case "lower":
      return capsuleBounds(j.knee, j.ankle, j.lowerRadius);
    case "foot":
      return boxBounds(j.footCenter, j.footHalf);
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

  switch (part) {
    case "head": {
      const headY = h * 0.925;
      const rx = p.headHeight * HEAD_PARAMS.xRatio + PAD;
      const ry = p.headHeight * HEAD_PARAMS.yRatio + PAD;
      const rz = p.headHeight * HEAD_PARAMS.zRatio + PAD;
      return {
        minX: -rx,
        maxX: rx,
        minY: h * 0.77 - PAD,
        maxY: headY + ry,
        minZ: -rz,
        maxZ: rz,
      };
    }
    case "torso": {
      const halfWidth = Math.max(p.shoulderWidth, p.chestWidth, p.waistWidth) / 2 + PAD;
      const depth = 0.12 * (h / 1.75) + PAD;
      return {
        minX: -halfWidth,
        maxX: halfWidth,
        minY: h * 0.50 - PAD,
        maxY: h * 0.85 + PAD,
        minZ: -depth,
        maxZ: depth,
      };
    }
    case "leftUpperArm":
      return armBounds(p, -1, "upper");
    case "leftForeArm":
      return armBounds(p, -1, "fore");
    case "leftHand":
      return armBounds(p, -1, "hand");
    case "rightUpperArm":
      return armBounds(p, 1, "upper");
    case "rightForeArm":
      return armBounds(p, 1, "fore");
    case "rightHand":
      return armBounds(p, 1, "hand");
    case "leftUpperLeg":
      return legBounds(p, -1, "upper");
    case "leftLowerLeg":
      return legBounds(p, -1, "lower");
    case "leftFoot":
      return legBounds(p, -1, "foot");
    case "rightUpperLeg":
      return legBounds(p, 1, "upper");
    case "rightLowerLeg":
      return legBounds(p, 1, "lower");
    case "rightFoot":
      return legBounds(p, 1, "foot");
  }
}


export interface SideJoints {
  shoulder: Vec3;
  elbow: Vec3;
  wrist: Vec3;
  handEnd: Vec3;
  hip: Vec3;
  knee: Vec3;
  ankle: Vec3;
  footCenter: Vec3;
  footHalf: Vec3;
}

/** "left" = the -x side, "right" = the +x side (same convention as the part names). */
export interface BodyJoints {
  left: SideJoints;
  right: SideJoints;
}

export function getBodyJoints(options: Partial<AvatarParameters> = {}): BodyJoints {
  const p = { ...DEFAULTS, ...options } as AvatarParameters;
  const side = (s: Side): SideJoints => {
    const a = armJoints(p, s);
    const l = legJoints(p, s);
    return {
      shoulder: a.shoulder,
      elbow: a.elbow,
      wrist: a.wrist,
      handEnd: a.handEnd,
      hip: l.hip,
      knee: l.knee,
      ankle: l.ankle,
      footCenter: l.footCenter,
      footHalf: l.footHalf,
    };
  };
  return { left: side(-1), right: side(1) };
}

export { DEFAULTS as DEFAULT_AVATAR_PARAMS };
