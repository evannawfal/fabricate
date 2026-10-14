import * as THREE from "three";
import {
  avatarSDF,
  DEFAULT_AVATAR_PARAMS,
} from "./sdf.js";

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

// Six tetrahedra sharing the cube's 0 -> 6 diagonal.
const TETRAHEDRA = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

const TETRA_EDGES = [
  [0, 1], [0, 2], [0, 3],
  [1, 2], [1, 3], [2, 3],
];

/**
 * Interpolate the zero crossing between two SDF samples.
 */
function interpolateSurface(a, b, da, db) {
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
function validateParameters(options) {
  const p = { ...DEFAULT_AVATAR_PARAMS, ...options };
  const resolution = options.resolution ?? 0.025;

  if (!(resolution >= 0.005 && resolution <= 0.05)) {
    throw new RangeError(
      "resolution must be between 0.005 and 0.05 meters"
    );
  }

  const keys = [
    "height",
    "shoulderWidth",
    "chestWidth",
    "waistWidth",
    "hipWidth",
    "headHeight",
    "neckWidth",
  ];

  for (const key of keys) {
    if (!Number.isFinite(p[key]) || p[key] <= 0) {
      throw new RangeError(
        `${key} must be a positive finite number`
      );
    }
  }

  if (p.headHeight >= p.height * 0.4) {
    throw new RangeError(
      "headHeight is too large for the avatar"
    );
  }

  return { p, resolution };
}

/**
 * Calculate the spatial bounds of the avatar.
 */
function calculateBounds(p) {
  const armLength = p.armLength ?? p.height * 0.33;
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
function createGrid(bounds, resolution) {
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
function gridPoint(i, j, k, grid, bounds) {
  return [
    bounds.minX + i * grid.dx,
    bounds.minY + j * grid.dy,
    bounds.minZ + k * grid.dz,
  ];
}

/**
 * Sample the SDF at every grid point.
 */
function sampleField(grid, bounds, field) {
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
function gradient(point, field, resolution) {
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
function normalAt(point, field, resolution) {
  const g = gradient(point, field, resolution);
  const length = Math.hypot(...g) || 1;

  return g.map(value => value / length);
}

/**
 * Calculate the cross product of two vectors.
 */
function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Calculate a triangle's centroid.
 */
function triangleCenter(a, b, c) {
  return [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
}

/**
 * Append a triangle with consistent outward-facing winding.
 */
function addTriangle(a, b, c, context) {
  const ab = b.map((value, i) => value - a[i]);
  const ac = c.map((value, i) => value - a[i]);
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
function polygonCenter(points) {
  const center = [0, 0, 0];

  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      center[axis] += point[axis] / points.length;
    }
  }

  return center;
}

/**
 * Build an orthonormal basis for sorting quad vertices.
 */
function createPlaneBasis(normal) {
  const helper = Math.abs(normal[0]) < 0.9
    ? [1, 0, 0]
    : [0, 1, 0];

  const u = crossProduct(normal, helper);
  const length = Math.hypot(...u) || 1;
  const normalizedU = u.map(value => value / length);
  const v = crossProduct(normal, normalizedU);

  return { u: normalizedU, v };
}

/**
 * Sort quad vertices around their centroid.
 */
function sortQuadVertices(points, center, normal) {
  const { u, v } = createPlaneBasis(normal);

  function angle(point) {
    const offset = point.map(
      (value, i) => value - center[i]
    );

    const alongU =
      offset[0] * u[0] +
      offset[1] * u[1] +
      offset[2] * u[2];

    const alongV =
      offset[0] * v[0] +
      offset[1] * v[1] +
      offset[2] * v[2];

    return Math.atan2(alongV, alongU);
  }

  return [...points].sort(
    (a, b) => angle(a) - angle(b)
  );
}

/**
 * Split a four-vertex intersection polygon into two triangles.
 */
function triangulateQuad(points, context) {
  const center = polygonCenter(points);
  const g = gradient(
    center,
    context.field,
    context.resolution
  );

  const length = Math.hypot(...g) || 1;
  const normal = g.map(value => value / length);
  const sorted = sortQuadVertices(points, center, normal);

  addTriangle(sorted[0], sorted[1], sorted[2], context);
  addTriangle(sorted[0], sorted[2], sorted[3], context);
}

/**
 * Polygonize one tetrahedron using its edge intersections.
 */
function polygonizeTetra(points, distances, context) {
  const intersections = [];

  for (const [ia, ib] of TETRA_EDGES) {
    const da = distances[ia];
    const db = distances[ib];

    if ((da < 0) !== (db < 0)) {
      intersections.push(
        interpolateSurface(
          points[ia],
          points[ib],
          da,
          db
        )
      );
    }
  }

  if (intersections.length === 3) {
    addTriangle(...intersections, context);
  } else if (intersections.length === 4) {
    triangulateQuad(intersections, context);
  }
}

/**
 * Get the eight corners and SDF values of one grid cell.
 */
function getCubeData(i, j, k, grid, bounds) {
  const points = CORNERS.map(([ci, cj, ck]) =>
    gridPoint(i + ci, j + cj, k + ck, grid, bounds)
  );

  const distances = CORNERS.map(([ci, cj, ck]) =>
    grid.values[grid.index(i + ci, j + cj, k + ck)]
  );

  return { points, distances };
}

/**
 * Check whether a grid cell intersects the zero surface.
 */
function intersectsSurface(distances) {
  const min = Math.min(...distances);
  const max = Math.max(...distances);

  return min <= 0 && max >= 0;
}

/**
 * Polygonize all six tetrahedra in one grid cell.
 */
function polygonizeCube(points, distances, context) {
  for (const tetra of TETRAHEDRA) {
    const tetraPoints = tetra.map(id => points[id]);
    const tetraDistances = tetra.map(id => distances[id]);

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
function polygonizeGrid(grid, bounds, context) {
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
function buildGeometry(positions, normals) {
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
export function generateAvatarGeometry(options = {}) {
  const { p, resolution } = validateParameters(options);
  const bounds = calculateBounds(p);
  const grid = createGrid(bounds, resolution);

  const field = (x, y, z) => avatarSDF(x, y, z, p);

  sampleField(grid, bounds, field);

  const context = {
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
