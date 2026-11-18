
import { describe, expect, it } from "@jest/globals";
import {
  getPartSDF,
  getPartBounds,
} from "../../src/avatar/partsSdf.js";
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

describe("getPartSDF", () => {
  it("provides an SDF evaluator for every body part", () => {
    for (const part of BODY_PARTS) {
      expect(typeof getPartSDF(part, params)).toBe("function");
    }
  });

  it("returns finite distances for representative points", () => {
    const points: [number, number, number][] = [
      [0, 1.35, 0],
      [0, 1.7, 0],
      [0.2, 1.0, 0],
      [-0.2, 0.8, 0],
      [10, 10, 10],
    ];

    for (const part of BODY_PARTS) {
      const sdf = getPartSDF(part, params);

      for (const [x, y, z] of points) {
        expect(Number.isFinite(sdf(x, y, z))).toBe(true);
      }
    }
  });

  it("returns a negative distance inside the head", () => {
    const sdf = getPartSDF("head", params);

    expect(sdf(0, params.height * 0.925, 0)).toBeLessThan(0);
  });

  it("returns a negative distance inside the torso", () => {
    const sdf = getPartSDF("torso", params);

    expect(sdf(0, params.height * 0.75, 0)).toBeLessThan(0);
  });

  it("returns a positive distance far outside every body part", () => {
    for (const part of BODY_PARTS) {
      const sdf = getPartSDF(part, params);

      expect(sdf(10, 10, 10)).toBeGreaterThan(0);
    }
  });
});

describe("getPartBounds", () => {
  it("returns finite bounding-box coordinates for every body part", () => {
    for (const part of BODY_PARTS) {
      const bounds = getPartBounds(part, params);

      for (const value of [
        bounds.minX,
        bounds.maxX,
        bounds.minY,
        bounds.maxY,
        bounds.minZ,
        bounds.maxZ,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("returns positive dimensions for every bounding box", () => {
    for (const part of BODY_PARTS) {
      const bounds = getPartBounds(part, params);

      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      expect(bounds.maxZ).toBeGreaterThan(bounds.minZ);
    }
  });

  it("updates the bounds when avatar measurements change", () => {
    const original = getPartBounds("torso", params);

    const widerParams = {
      ...params,
      shoulderWidth: 0.6,
    };

    const updated = getPartBounds("torso", widerParams);

    expect(updated.maxX - updated.minX).toBeGreaterThan(
      original.maxX - original.minX
    );
  });
});
