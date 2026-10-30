import { describe, expect, it } from "@jest/globals";
import { generateAvatarGeometry } from "../../src/avatar/meshGenerator.js";

const params = {
  height: 1.85,
  shoulderWidth: 0.4,
  chestWidth: 0.35,
  waistWidth: 0.3,
  hipWidth: 0.32,
  resolution: 0.04,
};

describe("generateAvatarGeometry", () => {
  // Verify that the generator produces a mesh with vertices and a valid triangle layout.
  it("generates a non-empty mesh", () => {
    const geometry = generateAvatarGeometry(params);

    try {
      const position = geometry.getAttribute("position");

      expect(position).toBeDefined();
      expect(position.count).toBeGreaterThan(0);
      expect(position.count % 3).toBe(0);
    } finally {
      geometry.dispose();
    }
  });

  // Verify that all generated vertex coordinates and normal vectors contain finite values.
  it("generates finite vertex coordinates and normals", () => {
    const geometry = generateAvatarGeometry(params);

    try {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");

      expect(normal.count).toBe(position.count);

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
  });

  // Verify that the generated mesh has a valid bounding box with finite coordinates and positive height.
  it("generates finite bounding-box coordinates", () => {
    const geometry = generateAvatarGeometry(params);

    try {
      geometry.computeBoundingBox();

      const bounds = geometry.boundingBox;
      if (bounds === null) {
        throw new Error('computeBoundingBox() left the bounding box null');
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
  });

  // Verify that the generator rejects a resolution smaller than the supported minimum.
  it("rejects a resolution below the supported minimum", () => {
    expect(() =>
      generateAvatarGeometry({
        ...params,
        resolution: 0.001,
      })
    ).toThrow(RangeError);
  });

  // Verify that the generator rejects invalid avatar dimensions, such as a negative height.
  it("rejects invalid avatar dimensions", () => {
    expect(() =>
      generateAvatarGeometry({
        ...params,
        height: -1,
      })
    ).toThrow(RangeError);
  });
});