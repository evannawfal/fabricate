import * as THREE from "three";
import { DEFAULT_AVATAR_PARAMS } from "../sdf.js";
import type {
  AvatarBounds,
  AvatarParameters,
  CubeCorners,
  CubeData,
  PolygonizeContext,
  SamplingGrid,
  ScalarField,
  TetraCorners,
  Vec3,
} from "../types.js";
import { getPartBounds, getPartSDF } from "./partsSdf.js";
import { BODY_PARTS, PART_METADATA, type BodyPartName } from "./types.js";

const CORNERS: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossProduct(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalAt(p: Vec3, field: ScalarField, epsilon: number): Vec3 {
  const [x, y, z] = p;
  const h = epsilon * 0.5;
  const dx = field(x + h, y, z) - field(x - h, y, z);
  const dy = field(x, y + h, z) - field(x, y - h, z);
  const dz = field(x, y, z + h) - field(x, y, z - h);
  const length = Math.hypot(dx, dy, dz) || 1;
  return [dx / length, dy / length, dz / length];
}

function interpolateSurface(a: Vec3, b: Vec3, da: number, db: number): Vec3 {
  const denominator = da - db;
  const t =
    Math.abs(denominator) < 1e-12
      ? 0.5
      : Math.max(0, Math.min(1, da / denominator));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function polygonCenter(points: Vec3[]): Vec3 {
  let [x, y, z] = [0, 0, 0];
  for (const [px, py, pz] of points) {
    x += px / points.length;
    y += py / points.length;
    z += pz / points.length;
  }
  return [x, y, z];
}

function createPlaneBasis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const helper = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = crossProduct(normal, helper as Vec3);
  const length = Math.hypot(...u) || 1;
  const normalizedU = u.map((val) => val / length) as Vec3;
  const v = crossProduct(normal, normalizedU);
  return { u: normalizedU, v };
}

function sortQuadVertices(
  points: TetraCorners<Vec3>,
  center: Vec3,
  normal: Vec3
): TetraCorners<Vec3> {
  const { u, v } = createPlaneBasis(normal);
  function angle(point: Vec3): number {
    const [ox, oy, oz] = subtract(point, center);
    const alongU = ox * u[0] + oy * u[1] + oz * u[2];
    const alongV = ox * v[0] + oy * v[1] + oz * v[2];
    return Math.atan2(alongV, alongU);
  }

  const [p0, p1, p2, p3] = points;
  const sorted: TetraCorners<Vec3> = [p0, p1, p2, p3];
  return sorted.sort((a, b) => angle(a) - angle(b));
}

function addTriangle(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  context: PolygonizeContext
): void {
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const cross = crossProduct(edge1, edge2);
  const length = Math.hypot(...cross) || 1;
  const faceNormal = cross.map((coord) => coord / length) as Vec3;

  const center: Vec3 = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
  const g = normalAt(center, context.field, context.resolution);

  const dot =
    faceNormal[0] * g[0] + faceNormal[1] * g[1] + faceNormal[2] * g[2];
  if (dot < 0) {
    [b, c] = [c, b];
  }

  for (const point of [a, b, c]) {
    context.positions.push(...point);
    context.normals.push(...normalAt(point, context.field, context.resolution));
  }
}

function triangulateQuad(
  quad: TetraCorners<Vec3>,
  context: PolygonizeContext
): void {
  const center = polygonCenter(quad);
  const normal = normalAt(center, context.field, context.resolution);
  const [a, b, c, d] = sortQuadVertices(quad, center, normal);
  addTriangle(a, b, c, context);
  addTriangle(a, c, d, context);
}

function polygonizeTetra(
  [p0, p1, p2, p3]: TetraCorners<Vec3>,
  [d0, d1, d2, d3]: TetraCorners<number>,
  context: PolygonizeContext
): void {
  const edges: [Vec3, Vec3, number, number][] = [
    [p0, p1, d0, d1],
    [p0, p2, d0, d2],
    [p0, p3, d0, d3],
    [p1, p2, d1, d2],
    [p1, p3, d1, d3],
    [p2, p3, d2, d3],
  ];
  const intersections: Vec3[] = [];
  for (const [a, b, da, db] of edges) {
    if (da < 0 !== db < 0) {
      intersections.push(interpolateSurface(a, b, da, db));
    }
  }

  const [first, second, third, fourth] = intersections;
  if (first === undefined || second === undefined || third === undefined) {
    return;
  }
  if (fourth === undefined) {
    addTriangle(first, second, third, context);
  } else {
    triangulateQuad([first, second, third, fourth], context);
  }
}

function gridPoint(
  i: number,
  j: number,
  k: number,
  grid: SamplingGrid,
  bounds: AvatarBounds
): Vec3 {
  return [
    bounds.minX + i * grid.dx,
    bounds.minY + j * grid.dy,
    bounds.minZ + k * grid.dz,
  ];
}

function getCubeData(
  i: number,
  j: number,
  k: number,
  grid: SamplingGrid,
  bounds: AvatarBounds
): CubeData {
  const points = CORNERS.map(([ci, cj, ck]) =>
    gridPoint(i + ci, j + cj, k + ck, grid, bounds)
  ) as CubeCorners<Vec3>;

  const distances = CORNERS.map(
    ([ci, cj, ck]) => grid.values[grid.index(i + ci, j + cj, k + ck)]
  ) as CubeCorners<number>;
  return { points, distances };
}

function intersectsSurface(distances: number[]): boolean {
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  return min <= 0 && max >= 0;
}

function polygonizeCube(
  points: CubeCorners<Vec3>,
  distances: CubeCorners<number>,
  context: PolygonizeContext
): void {
  const [p0, p1, p2, p3, p4, p5, p6, p7] = points;
  const [d0, d1, d2, d3, d4, d5, d6, d7] = distances;
  polygonizeTetra([p0, p5, p1, p6], [d0, d5, d1, d6], context);
  polygonizeTetra([p0, p1, p2, p6], [d0, d1, d2, d6], context);
  polygonizeTetra([p0, p2, p3, p6], [d0, d2, d3, d6], context);
  polygonizeTetra([p0, p3, p7, p6], [d0, d3, d7, d6], context);
  polygonizeTetra([p0, p7, p4, p6], [d0, d7, d4, d6], context);
  polygonizeTetra([p0, p4, p5, p6], [d0, d4, d5, d6], context);
}

function createGrid(bounds: AvatarBounds, resolution: number): SamplingGrid {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / resolution) + 1;
  const ny = Math.ceil((bounds.maxY - bounds.minY) / resolution) + 1;
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / resolution) + 1;
  const dx = (bounds.maxX - bounds.minX) / (nx - 1);
  const dy = (bounds.maxY - bounds.minY) / (ny - 1);
  const dz = (bounds.maxZ - bounds.minZ) / (nz - 1);
  const total = nx * ny * nz;

  return {
    nx,
    ny,
    nz,
    dx,
    dy,
    dz,
    index: (i: number, j: number, k: number) => i * (ny * nz) + j * nz + k,
    values: new Float32Array(total),
  };
}

function sampleField(
  grid: SamplingGrid,
  bounds: AvatarBounds,
  field: ScalarField
): void {
  for (let i = 0; i < grid.nx; i++) {
    const x = bounds.minX + i * grid.dx;
    for (let j = 0; j < grid.ny; j++) {
      const y = bounds.minY + j * grid.dy;
      for (let k = 0; k < grid.nz; k++) {
        const z = bounds.minZ + k * grid.dz;
        grid.values[grid.index(i, j, k)] = field(x, y, z);
      }
    }
  }
}

/**
 * Generates geometry for a single body part.
 */
export function generatePartGeometry(
  part: BodyPartName,
  options: Partial<AvatarParameters> = {}
): THREE.BufferGeometry {
  const p = { ...DEFAULT_AVATAR_PARAMS, ...options } as AvatarParameters;
  const resolution = options.resolution ?? 0.015;
  const bounds = getPartBounds(part, p);
  const grid = createGrid(bounds, resolution);
  const field = getPartSDF(part, p);

  sampleField(grid, bounds, field);

  const context: PolygonizeContext = {
    field,
    resolution,
    positions: [],
    normals: [],
  };

  for (let i = 0; i < grid.nx - 1; i++) {
    for (let j = 0; j < grid.ny - 1; j++) {
      for (let k = 0; k < grid.nz - 1; k++) {
        const { points, distances } = getCubeData(i, j, k, grid, bounds);
        if (!intersectsSurface(distances)) {
          continue;
        }
        polygonizeCube(points, distances, context);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(context.positions, 3)
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(context.normals, 3)
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Generates all body parts as Three.js Mesh instances.
 */
export function generateSegmentedAvatarMeshes(
  options: Partial<AvatarParameters> = {},
  useDistinctColors = true
): Map<BodyPartName, THREE.Mesh> {
  const p = { ...DEFAULT_AVATAR_PARAMS, ...options } as AvatarParameters;
  const meshes = new Map<BodyPartName, THREE.Mesh>();

  for (const part of BODY_PARTS) {
    const geometry = generatePartGeometry(part, p);
    const meta = PART_METADATA[part];
    const color = useDistinctColors ? meta.color : 0xb8b5ae;

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part;
    mesh.userData = {
      partName: part,
      displayName: meta.displayName,
      coveredBy: meta.coveredBy,
    };

    meshes.set(part, mesh);
  }

  return meshes;
}
