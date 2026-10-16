export type Vec3 = [number, number, number];

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

export interface CubeData {
  points: Vec3[];
  distances: number[];
}