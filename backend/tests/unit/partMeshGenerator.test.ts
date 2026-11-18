
import { describe, expect, it } from "@jest/globals";
import {
  generatePartGeometry,
  generateSegmentedAvatarMeshes,
} from "../../src/avatar/partsMeshGenerator.js";
import { BODY_PARTS } from "../../src/avatar/types.js";
import type { AvatarParameters } from "../../src/avatar/types.js";

const params: AvatarParameters = {
  height: 1.85,
  shoulderWidth: 0.4,
  chestWidth: 0.35,
  waistWidth: 0.3,
  hipWidth: 0.32,
  headHeight: 0.23,
  neckWidth: 0.12,
  armLengthRatio: 0.30,
  legLengthRatio: 0.50,
  resolution: 0.04,
};

describe("generatePartGeometry", () => {
  it("generates a non-empty mesh for every body part", () => {
    for (const part of BODY_PARTS) {
      const geometry = generatePartGeometry(part, params);

      try {
        const position = geometry.getAttribute("position");

        expect(position).toBeDefined();
        expect(position.count).toBeGreaterThan(0);
        expect(position.count % 3).toBe(0);
      } finally {
        geometry.dispose();
      }
    }
  });

  it("generates matching position and normal attributes", () => {
    for (const part of BODY_PARTS) {
      const geometry = generatePartGeometry(part, params);

      try {
        const position = geometry.getAttribute("position");
        const normal = geometry.getAttribute("normal");

        expect(normal).toBeDefined();
        expect(normal.count).toBe(position.count);
      } finally {
        geometry.dispose();
      }
    }
  });

  it("generates finite vertex coordinates and normals", () => {
    for (const part of BODY_PARTS) {
      const geometry = generatePartGeometry(part, params);

      try {
        const position = geometry.getAttribute("position");
        const normal = geometry.getAttribute("normal");

        for (let i = 0; i < position.count; i++) {
          expect(Number.isFinite(position.getX(i))).toBe(true);
          expect(Number.isFinite(position.getY(i))).toBe(true);
          expect(Number.isFinite(position.getZ(i))).toBe(true);

          expect(Number.isFinite(normal.getX(i))).toBe(true);
          expect(Number.isFinite(normal.getY(i))).toBe(true);
          expect(Number.isFinite(normal.getZ(i))).toBe(true);
        }
      } finally {
        geometry.dispose();
      }
    }
  });

  it("generates valid bounding boxes for every body part", () => {
    for (const part of BODY_PARTS) {
      const geometry = generatePartGeometry(part, params);

      try {
        geometry.computeBoundingBox();

        const bounds = geometry.boundingBox;
        expect(bounds).not.toBeNull();

        if (!bounds) {
          throw new Error("Bounding box was not generated");
        }

        for (const value of [
          bounds.min.x,
          bounds.min.y,
          bounds.min.z,
          bounds.max.x,
          bounds.max.y,
          bounds.max.z,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }

        expect(bounds.max.y).toBeGreaterThan(bounds.min.y);
      } finally {
        geometry.dispose();
      }
    }
  });

  it("generates different geometry when avatar measurements change", () => {
    const original = generatePartGeometry("torso", params);
    const wider = generatePartGeometry("torso", {
      ...params,
      shoulderWidth: 0.6,
    });

    try {
      original.computeBoundingBox();
      wider.computeBoundingBox();

      expect(wider.boundingBox!.max.x - wider.boundingBox!.min.x)
        .toBeGreaterThan(
          original.boundingBox!.max.x - original.boundingBox!.min.x
        );
    } finally {
      original.dispose();
      wider.dispose();
    }
  });
});

describe("generateSegmentedAvatarMeshes", () => {
  it("generates a mesh for every body part", () => {
    const meshes = generateSegmentedAvatarMeshes(params);

    try {
      expect(meshes.size).toBe(BODY_PARTS.length);

      for (const part of BODY_PARTS) {
        expect(meshes.has(part)).toBe(true);
      }
    } finally {
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();

        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
  });

  it("assigns the correct name and part metadata to each mesh", () => {
    const meshes = generateSegmentedAvatarMeshes(params);

    try {
      for (const [part, mesh] of meshes) {
        expect(mesh.name).toBe(part);
        expect(mesh.userData.partName).toBe(part);
        expect(typeof mesh.userData.displayName).toBe("string");
        expect(Array.isArray(mesh.userData.coveredBy)).toBe(true);
      }
    } finally {
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
  });
});
