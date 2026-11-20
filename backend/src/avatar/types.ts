export type Vec3 = [number, number, number];

export interface AvatarInput {
  height: number;
  shoulderWidth: number;
  chestWidth: number;
  waistWidth: number;
  hipWidth: number;
}

export interface AvatarParameters {
  height: number;
  shoulderWidth: number;
  chestWidth: number;
  waistWidth: number;
  hipWidth: number;
  resolution?: number;
  headHeight: number;
  neckWidth: number;
  armLengthRatio: number;
  legLengthRatio: number;
}

export interface AvatarBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface SamplingGrid {
  nx: number;
  ny: number;
  nz: number;
  dx: number;
  dy: number;
  dz: number;
  index: (i: number, j: number, k: number) => number;
  values: Float32Array;
}

export type ScalarField = (x: number, y: number, z: number) => number;

export interface PolygonizeContext {
  field: ScalarField;
  resolution: number;
  positions: number[];
  normals: number[];
}

// In the same order as CORNERS in meshGenerator.ts.
export type CubeCorners<T> = [T, T, T, T, T, T, T, T];
export type TetraCorners<T> = [T, T, T, T];

export interface CubeData {
  points: CubeCorners<Vec3>;
  distances: CubeCorners<number>;
}


export type BodyPartName =
  | "head"
  | "torso"
  | "leftUpperArm"
  | "leftForeArm"
  | "leftHand"
  | "rightUpperArm"
  | "rightForeArm"
  | "rightHand"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot";

export const BODY_PARTS: readonly BodyPartName[] = [
  "head",
  "torso",
  "leftUpperArm",
  "leftForeArm",
  "leftHand",
  "rightUpperArm",
  "rightForeArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
] as const;

export interface PartVisualMetadata {
  name: BodyPartName;
  displayName: string;
  color: number;
  description: string;
  coveredBy: ("top" | "bottom" | "outerwear")[];
}

const DEFAULT_SKIN_COLOR = 0xffffff;

export const PART_METADATA: Record<BodyPartName, PartVisualMetadata> = {
  head: {
    name: "head",
    displayName: "Head & Neck",
    color: DEFAULT_SKIN_COLOR,
    description: "Head and neck. Anchor for tops/collars; remains visible when clothed.",
    coveredBy: [],
  },
  torso: {
    name: "torso",
    displayName: "Torso",
    color: DEFAULT_SKIN_COLOR,
    description: "Shoulders, chest, and waist. Covered by shirts, t-shirts, dresses, and jackets.",
    coveredBy: ["top", "outerwear"],
  },
  leftUpperArm: {
    name: "leftUpperArm",
    displayName: "L Upper Arm",
    color: DEFAULT_SKIN_COLOR,
    description: "Left shoulder joint to elbow. Covered by sleeves.",
    coveredBy: ["top", "outerwear"],
  },
  leftForeArm: {
    name: "leftForeArm",
    displayName: "L Forearm",
    color: DEFAULT_SKIN_COLOR,
    description: "Left elbow to wrist. Covered by long sleeves.",
    coveredBy: ["top", "outerwear"],
  },
  leftHand: {
    name: "leftHand",
    displayName: "L Hand",
    color: DEFAULT_SKIN_COLOR,
    description: "Left hand. Normally stays visible.",
    coveredBy: [],
  },
  rightUpperArm: {
    name: "rightUpperArm",
    displayName: "R Upper Arm",
    color: DEFAULT_SKIN_COLOR,
    description: "Right shoulder joint to elbow. Covered by sleeves.",
    coveredBy: ["top", "outerwear"],
  },
  rightForeArm: {
    name: "rightForeArm",
    displayName: "R Forearm",
    color: DEFAULT_SKIN_COLOR,
    description: "Right elbow to wrist. Covered by long sleeves.",
    coveredBy: ["top", "outerwear"],
  },
  rightHand: {
    name: "rightHand",
    displayName: "R Hand",
    color: DEFAULT_SKIN_COLOR,
    description: "Right hand. Normally stays visible.",
    coveredBy: [],
  },
  leftUpperLeg: {
    name: "leftUpperLeg",
    displayName: "L Thigh",
    color: DEFAULT_SKIN_COLOR,
    description: "Left half of the pelvis and thigh down to the knee. Covered by shorts, pants, skirts.",
    coveredBy: ["bottom"],
  },
  leftLowerLeg: {
    name: "leftLowerLeg",
    displayName: "L Lower Leg",
    color: DEFAULT_SKIN_COLOR,
    description: "Left knee to ankle. Exposed with shorts/skirts; covered by pants. Can be relocated to the garment's lower hem.",
    coveredBy: ["bottom"],
  },
  leftFoot: {
    name: "leftFoot",
    displayName: "L Foot",
    color: DEFAULT_SKIN_COLOR,
    description: "Left foot. Can be relocated to the garment's lower hem.",
    coveredBy: [],
  },
  rightUpperLeg: {
    name: "rightUpperLeg",
    displayName: "R Thigh",
    color: DEFAULT_SKIN_COLOR,
    description: "Right half of the pelvis and thigh down to the knee. Covered by shorts, pants, skirts.",
    coveredBy: ["bottom"],
  },
  rightLowerLeg: {
    name: "rightLowerLeg",
    displayName: "R Lower Leg",
    color: DEFAULT_SKIN_COLOR,
    description: "Right knee to ankle. Exposed with shorts/skirts; covered by pants. Can be relocated to the garment's lower hem.",
    coveredBy: ["bottom"],
  },
  rightFoot: {
    name: "rightFoot",
    displayName: "R Foot",
    color: DEFAULT_SKIN_COLOR,
    description: "Right foot. Can be relocated to the garment's lower hem.",
    coveredBy: [],
  },
};

export interface SegmentedMeshDetails {
  name: BodyPartName;
  displayName: string;
  vertexCount: number;
  triangleCount: number;
  bounds: AvatarBounds;
}
