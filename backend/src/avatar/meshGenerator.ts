import * as THREE from "three";

import {
  avatarSDF,
  DEFAULT_AVATAR_PARAMS,
} from "./sdf.js";
import {
  Vec3, AvatarParameters, AvatarBounds, SamplingGrid, PolygonizeContext, CubeData, ScalarField
} from "./types.js";

const CORNERS: Vec3[] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

const TETRAHEDRA: number[][] = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

const TETRA_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3],
  [1, 2], [1, 3], [2, 3],
];

/**
 * Interpolate the zero crossing between two SDF samples.
 */
function interpolateSurface(a: Vec3, b: Vec3, da: number, db: number): Vec3 {
  const denominator = da - db;
  const t = Math.abs(denominator) < 1e-12
    ? 0.5
    : Math.max(0, Math.min(1, da / denominator));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Merge defaults and validate avatar parameters.
 */
function validateParameters(options: Partial<AvatarParameters>): { p: AvatarParameters; resolution: number } {
  const p = { ...DEFAULT_AVATAR_PARAMS, ...options } as AvatarParameters;
  // Users can't choose the resolution (POST /avatar only takes measurements), so the
  // server's default applies; other callers (e.g. tests) may pick one in the supported range.
  const resolution = options.resolution ?? DEFAULT_AVATAR_PARAMS.resolution;
  if (!(resolution >= 0.005 && resolution <= 0.05)) {
    throw new RangeError(
      "resolution must be between 0.005 and 0.05 meters"
    );
  }

  const keys: (keyof AvatarParameters)[] = [
    "height",
    "shoulderWidth",
    "chestWidth",
    "waistWidth",
    "hipWidth",
  ];

  for (const key of keys) {
    if (!Number.isFinite(p[key]) || (p[key] as number) <= 0) {
      throw new RangeError(
        `${key} must be a positive finite number`
      );
    }
  }
  return { p, resolution };
}

/**
 * Calculate the spatial bounds of the avatar.
 */
function calculateBounds(p: AvatarParameters): AvatarBounds {
  const armLength = p.armLengthRatio * p.height;
  const handLength = p.height * 0.085;
  const armReach =
    p.shoulderWidth * 0.43 +
    armLength * 0.52 * 0.45 +
    armLength * 0.48 * 0.35 +
    handLength;
  const halfWidth = Math.max(
    p.shoulderWidth / 2,
    p.chestWidth / 2,
    p.waistWidth / 2,
    p.hipWidth / 2,
    armReach
  ) + 0.06;
  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minY: -0.05,
    maxY: p.height + 0.02,
    minZ: -0.40,
    maxZ: 0.30,
  };
}

/**
 * Create the sampling grid and its dimensions.
 */
function createGrid(bounds: AvatarBounds, resolution: number): SamplingGrid {
  const nx = Math.ceil(
    (bounds.maxX - bounds.minX) / resolution
  ) + 1;
  const ny = Math.ceil(
    (bounds.maxY - bounds.minY) / resolution
  ) + 1;
  const nz = Math.ceil(
    (bounds.maxZ - bounds.minZ) / resolution
  ) + 1;
  return {
    nx,
    ny,
    nz,
    dx: (bounds.maxX - bounds.minX) / (nx - 1),
    dy: (bounds.maxY - bounds.minY) / (ny - 1),
    dz: (bounds.maxZ - bounds.minZ) / (nz - 1),
    index: (i, j, k) => (i * ny + j) * nz + k,
    values: new Float32Array(nx * ny * nz),
  };
}

/**
 * Convert grid coordinates to world coordinates.
 */
function gridPoint(i: number, j: number, k: number, grid: SamplingGrid, bounds: AvatarBounds): Vec3 {
  return [
    bounds.minX + i * grid.dx,
    bounds.minY + j * grid.dy,
    bounds.minZ + k * grid.dz,
  ];
}

/**
 * Sample the SDF at every grid point.
 */
function sampleField(grid: SamplingGrid, bounds: AvatarBounds, field: ScalarField): void {
  for (let i = 0; i < grid.nx; i++) {
    for (let j = 0; j < grid.ny; j++) {
      for (let k = 0; k < grid.nz; k++) {
        const point = gridPoint(i, j, k, grid, bounds);
        grid.values[grid.index(i, j, k)] =
          field(...point);
      }
    }
  }
}

/**
 * Calculate the numerical gradient of the SDF.
 * The gradient approximately points outward from the surface.
 */
function gradient(point: Vec3, field: ScalarField, resolution: number): Vec3 {
  const [x, y, z] = point;
  const e = resolution * 0.25;
  return [
    field(x + e, y, z) - field(x - e, y, z),
    field(x, y + e, z) - field(x, y - e, z),
    field(x, y, z + e) - field(x, y, z - e),
  ];
}

/**
 * Normalize the SDF gradient at a surface point.
 */
function normalAt(point: Vec3, field: ScalarField, resolution: number): Vec3 {
  const g = gradient(point, field, resolution);
  const length = Math.hypot(...g) || 1;
  return g.map(value => value / length) as Vec3;
}

/**
 * Calculate the cross product of two vectors.
 */
function crossProduct(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Calculate a triangle's centroid.
 */
function triangleCenter(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
}

/**
 * Append a triangle with consistent outward-facing winding.
 */
function addTriangle(a: Vec3, b: Vec3, c: Vec3, context: PolygonizeContext): void {
  const ab = b.map((value, i) => value - (a[i] as number)) as Vec3;
  const ac = c.map((value, i) => value - (a[i] as number)) as Vec3;
  const faceNormal = crossProduct(ab, ac);
  const center = triangleCenter(a, b, c);
  const g = gradient(
    center,
    context.field,
    context.resolution
  );

  const dot =
    faceNormal[0] * g[0] +
    faceNormal[1] * g[1] +
    faceNormal[2] * g[2];
  if (dot < 0) {
    [b, c] = [c, b];
  }

  for (const point of [a, b, c]) {
    context.positions.push(...point);
    context.normals.push(
      ...normalAt(
        point,
        context.field,
        context.resolution
      )
    );
  }
}

/**
 * Calculate the centroid of a polygon.
 */
function polygonCenter(points: Vec3[]): Vec3 {
  const center: Vec3 = [0, 0, 0];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      center[axis]! += point[axis]! / points.length;
    }
  }
  return center;
}

/**
 * Build an orthonormal basis for sorting quad vertices.
 */
function createPlaneBasis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const helper = Math.abs(normal[0]) < 0.9
    ? [1, 0, 0]
    : [0, 1, 0];
  const u = crossProduct(normal, helper as Vec3);
  const length = Math.hypot(...u) || 1;
  const normalizedU = u.map(value => value / length) as Vec3;
  const v = crossProduct(normal, normalizedU);
  return { u: normalizedU, v };
}

/**
 * Sort quad vertices around their centroid.
 */
function sortQuadVertices(points: Vec3[], center: Vec3, normal: Vec3): Vec3[] {
  const { u, v } = createPlaneBasis(normal);
  function angle(point: Vec3): number {
    const offset = point.map(
      (value, i) => value - center[i]!
    );
    const alongU =
      offset[0]! * u[0] +
      offset[1]! * u[1] +
      offset[2]! * u[2];
    const alongV =
      offset[0]! * v[0] +
      offset[1]! * v[1] +
      offset[2]! * v[2];

    return Math.atan2(alongV, alongU);
  }

  return [...points].sort(
    (a, b) => angle(a) - angle(b)
  );
}

/**
 * Split a four-vertex intersection polygon into two triangles.
 */
function triangulateQuad(points: Vec3[], context: PolygonizeContext): void {
  const center = polygonCenter(points);
  const g = gradient(
    center,
    context.field,
    context.resolution
  );
  const length = Math.hypot(...g) || 1;
  const normal = g.map(value => value / length) as Vec3;
  const sorted = sortQuadVertices(points, center, normal);

  addTriangle(sorted[0]!, sorted[1]!, sorted[2]!, context);
  addTriangle(sorted[0]!, sorted[2]!, sorted[3]!, context);

}

/**
 * Polygonize one tetrahedron using its edge intersections.
 */
function polygonizeTetra(points: Vec3[], distances: number[], context: PolygonizeContext): void {
  const intersections: Vec3[] = [];
  for (const [ia, ib] of TETRA_EDGES) {
    const da = distances[ia]!;
    const db = distances[ib]!;
    if ((da < 0) !== (db < 0)) {

      intersections.push(
        interpolateSurface(
          points[ia]!,
          points[ib]!,
          da,
          db
        )
      );
    }
  }

  if (intersections.length === 3) {
    addTriangle(intersections[0]!, intersections[1]!, intersections[2]!, context);
  } else if (intersections.length === 4) {
    triangulateQuad(intersections, context);
  }
}

/**
 * Get the eight corners and SDF values of one grid cell.
 */
function getCubeData(i: number, j: number, k: number, grid: SamplingGrid, bounds: AvatarBounds): CubeData {
  const points: Vec3[] = CORNERS.map(([ci, cj, ck]) =>
    gridPoint(i + ci, j + cj, k + ck, grid, bounds)
  );

  const distances = CORNERS.map(([ci, cj, ck]) =>
    grid.values[grid.index(i + ci, j + cj, k + ck)]
  ) as number[];
  return { points, distances };
}

/**
 * Check whether a grid cell intersects the zero surface.
 */
function intersectsSurface(distances: number[]): boolean {
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  return min <= 0 && max >= 0;
}

/**
 * Polygonize all six tetrahedra in one grid cell.
 */
function polygonizeCube(points: Vec3[], distances: number[], context: PolygonizeContext): void {
  for (const tetra of TETRAHEDRA) {
    const tetraPoints: Vec3[] = tetra.map(id => points[id]!);
    const tetraDistances: number[] = tetra.map(id => distances[id]!);
    polygonizeTetra(
      tetraPoints,
      tetraDistances,
      context
    );
  }
}

/**
 * Traverse the grid and generate the surface triangles.
 */
function polygonizeGrid(grid: SamplingGrid, bounds: AvatarBounds, context: PolygonizeContext): void {
  for (let i = 0; i < grid.nx - 1; i++) {
    for (let j = 0; j < grid.ny - 1; j++) {
      for (let k = 0; k < grid.nz - 1; k++) {
        const { points, distances } = getCubeData(
          i, j, k, grid, bounds
        );
        if (!intersectsSurface(distances)) {
          continue;
        }
        polygonizeCube(points, distances, context);
      }
    }
  }
}

/**
 * Construct the final Three.js BufferGeometry.
 */
function buildGeometry(positions: number[], normals: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(normals, 3)
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Generate a avatar mesh from its signed distance field.
 *
 * Uses marching tetrahedra to extract the zero-level surface.
 * Coordinates are in meters, with Y pointing upward.
 */

export function generateAvatarGeometry(options: Partial<AvatarParameters> = {}): THREE.BufferGeometry {
  const { p, resolution } = validateParameters(options);
  const bounds = calculateBounds(p);
  const grid = createGrid(bounds, resolution);
  const field = (x: number, y: number, z:number) => avatarSDF(x, y, z, p);
  sampleField(grid, bounds, field);
  const context: PolygonizeContext = {
    field,
    resolution,
    positions: [],
    normals: [],
  };
  polygonizeGrid(grid, bounds, context);
  return buildGeometry(
    context.positions,
    context.normals
  );
}
