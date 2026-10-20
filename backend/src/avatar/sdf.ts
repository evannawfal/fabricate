import { AvatarParameters, Vec3 } from "./types.js";

/**
 * Default ratios 
 */
const DEFAULTS = {
  headHeight: 0.23,
  neckWidth: 0.12,
  armLengthRatio: 0.30,
  legLengthRatio: 0.46,
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

/**
 * Parameters for defining head
 */
const HEAD_PARAMS = {
  xRatio: 0.36,
  yRatio: 0.5,
  zRatio: 0.37,
}

/**
 * Define head part using params
 */
function defineHead(
  x: number,
  y: number,
  z: number,
  headY: number,
  headHeight: number
): number { 
  return sdEllipsoid(
    x, y, z,
    [0, headY, 0],
    [
      headHeight * HEAD_PARAMS.xRatio,
      headHeight * HEAD_PARAMS.yRatio,
      headHeight * HEAD_PARAMS.zRatio,
    ]
  );
}

/**
 * Parameters for defining neck
 */
const NECK_PARAMS = {
  radiusToWidth: 0.42,
}

/**
 * Define neck part using params
 */
function defineNeck(
  x: number,
  y: number,
  z: number,
  neckWidth: number,
  neckBottom: number,
  neckTop: number,
): number { 
  const neckRadius = neckWidth * NECK_PARAMS.radiusToWidth;
  return sdCapsule(
    x, y, z,
    [0, neckBottom, 0],
    [0, neckTop, 0],
    neckRadius
  );
}

/**
 * Parameters for defining shoulder
 */
const SHOULDER_PARAMS = {
  xToWidth: 0.50,
  yToWidth: 0.17,
  zToWidth: 0.20,
}

/**
 * Define shoulder part using params
 */
function defineShoulder(
  x: number,
  y: number,
  z: number,
  shoulderY: number,
  shoulderWidth: number,
): number { 
  return sdEllipsoid(
    x, y, z,
    [0, shoulderY, 0],
    [
      shoulderWidth * SHOULDER_PARAMS.xToWidth,
      shoulderWidth * SHOULDER_PARAMS.yToWidth,
      shoulderWidth * SHOULDER_PARAMS.zToWidth,
    ]
  );
}

/**
 * Parameters for defining chest
 */
const CHEST_PARAMS = {
  xToWidth: 0.50,
  yToWidth: 0.32,
  zToWidth: 0.27,
}

/**
 * Define chest part using params
 */
function defineChest(
  x: number,
  y: number,
  z: number,
  chestY: number,
  chestWidth: number
): number {
  return sdEllipsoid(
    x, y, z,
    [0, chestY, 0],
    [
      chestWidth * CHEST_PARAMS.xToWidth,
      chestWidth * CHEST_PARAMS.yToWidth,
      chestWidth * CHEST_PARAMS.zToWidth,
    ]
  );
}

/**
 * Parameters for defining waist
 */
const WAIST_PARAMS = {
  xToWidth: 0.50,
  yToHeight: 0.125,
  zToDepth: 0.82,
}

/**
 * Define head waist using params
 */
function defineWaist(
  x: number,
  y: number,
  z: number,
  waistY: number,
  waistWidth: number,
  h: number,
  depth: number) {
  return sdEllipsoid(
    x, y, z,
    [0, waistY, 0],
    [
      waistWidth * WAIST_PARAMS.xToWidth,
      h * WAIST_PARAMS.yToHeight,
      depth * WAIST_PARAMS.zToDepth,
    ]
  );
}

/**
 * Parameters for defining arms
 */
const ARMS_PARAMS = {
  upperLengthToArmLength: 0.52,
  upperRadiusToArmLength: 0.072,
  handLengthToArmLength: 0.05,
  handRadiusToArmLength: 0.075,
  shoulderXToShoulderWidth: 0.46,
  armToBodyAngleRad: (15 * Math.PI) / 180,
  forearmToBodyAngleRad: (10 * Math.PI) / 180,
  shoulderJoinY: 0.99,
}

/**
 * Define arm parts using params
 */
function defineArms(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters,
  shoulderY: number,
  h: number,
  blend: number,
): number {
  const armLength = p.armLengthRatio * h;
  const upperLength = armLength * ARMS_PARAMS.upperLengthToArmLength;
  const forearmLength = armLength * (1.0 - ARMS_PARAMS.upperLengthToArmLength);
  const upperRadius = armLength * ARMS_PARAMS.upperRadiusToArmLength;
  const forearmRadius = upperRadius;
  const handLength = armLength * ARMS_PARAMS.handLengthToArmLength;
  const handRadius = armLength * ARMS_PARAMS.handRadiusToArmLength;

  let arms = Infinity;

  for (const side of [-1, 1]) {
    const shoulderX = side * p.shoulderWidth * ARMS_PARAMS.shoulderXToShoulderWidth;
    const elbowX = side * (
      p.shoulderWidth * ARMS_PARAMS.shoulderXToShoulderWidth + upperLength * Math.sin(ARMS_PARAMS.armToBodyAngleRad)
    );
    const wristX = elbowX + side * forearmLength *  Math.sin(ARMS_PARAMS.forearmToBodyAngleRad);
    const shoulder = [shoulderX, shoulderY * ARMS_PARAMS.shoulderJoinY, 0] as Vec3;
    const elbow = [
      elbowX,
      shoulder[1] - upperLength * Math.cos(ARMS_PARAMS.armToBodyAngleRad) * 0.95,
      0,
    ] as Vec3;
    const wrist = [
      wristX,
      elbow[1] - forearmLength * Math.cos(ARMS_PARAMS.forearmToBodyAngleRad) * 0.95,
      0,
    ] as Vec3;
    const handEnd = [
      wristX,
      wrist[1] - handLength,
      0,
    ] as Vec3;

    const upperArm = sdCapsule(
      x, y, z, shoulder, elbow, upperRadius
    );
    const forearm = sdCapsule(
      x, y, z, elbow, wrist, forearmRadius
    );
    const hand = sdCapsule(
      x, y, z, wrist, handEnd, handRadius
    );

    let arm = smoothMin(upperArm, forearm, 0.0);
    arm = smoothMin(arm, hand, 0.0);
    arms = smoothMin(arms, arm, blend);
  }
  return arms;
}

/**
 * Parameters for defining legs
 */
const LEGS_PARAMS = {
  upperLengthToLegLength: 0.53,
  upperRadiusToLegLength: 0.085,
  lowerRadiusToLegLength: 0.075,
  hipStart: 0.26,
  upperLegToVerticleRad: (2 * Math.PI) / 180,
  lowerLegToVerticleRad: (2 * Math.PI) / 180,
  foot: {
    toHeight: {
      x: 0.035,
      y: 0.025,
      z: 0.070,
    }
  },
}

/**
 * Define leg parts using params
 */
function defineLegs(
  x: number,
  y: number,
  z: number,
  p: AvatarParameters,
  waistY: number,
  h: number,
  blend: number,
): number {
  const legLength = p.legLengthRatio * h ;
  const upperLength = legLength * LEGS_PARAMS.upperLengthToLegLength;
  const lowerLength = legLength - upperLength;
  const upperRadius = legLength * LEGS_PARAMS.upperRadiusToLegLength;
  const lowerRadius = legLength * LEGS_PARAMS.lowerRadiusToLegLength;

  let legs = Infinity;
  for (const side of [-1, 1]) {
    const hipX = side * p.hipWidth * LEGS_PARAMS.hipStart;
    const kneeX = hipX + side * Math.sin(LEGS_PARAMS.upperLegToVerticleRad) * upperLength;
    const ankleX = kneeX + side * Math.sin(LEGS_PARAMS.lowerLegToVerticleRad) * lowerLength;

    const hip = [hipX, waistY - h * WAIST_PARAMS.yToHeight * 0.85, 0] as Vec3;
    const knee = [
      kneeX,
      hip[1] - upperLength * Math.cos(LEGS_PARAMS.upperLegToVerticleRad) * 0.70,
      0,
    ] as Vec3;
    const ankle = [
      ankleX,
      knee[1] - lowerLength * Math.cos(LEGS_PARAMS.lowerLegToVerticleRad) * 0.70,
      0,
    ] as Vec3;
    const thigh = sdCapsule(
      x, y, z, hip, knee, upperRadius
    );
    const shin = sdCapsule(
      x, y, z, knee, ankle, lowerRadius
    );
    const foot = sdRoundedBox(
      x, y, z,
      [ankle[0], ankle[1] - h * 0.025, h * 0.030],
      [
        h * LEGS_PARAMS.foot.toHeight.x,
        h * LEGS_PARAMS.foot.toHeight.y,
        h * LEGS_PARAMS.foot.toHeight.z,
      ],
      h * 0.025
    );
    let leg = smoothMin(thigh, shin, blend * 0.2); 
    legs = smoothMin(legs, foot, blend * 0.0);
    legs = smoothMin(legs, leg, blend);
  }
  return legs;
}

/**
 * Signed distance to the core avatar.
 */
export function avatarSDF(
  x: number,
  y: number,
  z: number,
  options = {}
): number {
  const p = { ...DEFAULTS, ...options } as AvatarParameters;
  const h = p.height;

  const headY = h * 0.925;
  const neckTop = headY - p.headHeight * 0.48;
  const neckBottom = h * 0.815;
  const shoulderY = h * 0.8; 
  const chestY = h * 0.75;
  const waistY = h * 0.65;
  const depth = 0.12 * (h / 1.75);
  const blend = 0.055 * (h / 1.75);

  const head = defineHead(x, y, z, headY, p.headHeight);
  const neck = defineNeck(
    x, y, z, p.neckWidth, neckBottom, neckTop
  );
  const shoulders = defineShoulder(
    x, y, z, shoulderY, p.shoulderWidth
  );
  const chest = defineChest(
    x, y, z, chestY, p.chestWidth
  );
  const waist = defineWaist(
    x, y, z, waistY, p.waistWidth, h, depth
  );

  const arms = defineArms(x, y, z, p, shoulderY, h, blend);
  const legs = defineLegs(x, y, z, p, waistY, h, blend);

  let d = smoothMin(head, neck, blend);
  d = smoothMin(d, shoulders, blend);
  d = smoothMin(d, chest, blend);
  d = smoothMin(d, waist, blend);
  d = smoothMin(d, arms, blend * 0.3);
  d = smoothMin(d, legs, blend);
  return d;
}

export { DEFAULTS as DEFAULT_AVATAR_PARAMS };
