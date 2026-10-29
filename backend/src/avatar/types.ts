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

// The eight corners of a grid cell, in the order of CORNERS in meshGenerator.ts.
export type CubeCorners<T> = [T, T, T, T, T, T, T, T];
export type TetraCorners<T> = [T, T, T, T];

export interface CubeData {
  points: CubeCorners<Vec3>;
  distances: CubeCorners<number>;
}