
import { describe, expect, it } from "@jest/globals";
import {
  avatarSDF,
  DEFAULT_AVATAR_PARAMS,
  sdEllipsoid,
  sdRoundedBox,
  sdCapsule,
  smoothMin,
} from "../../src/avatar/sdf.js";

const params = {
  ...DEFAULT_AVATAR_PARAMS,
  height: 1.85,
  shoulderWidth: 0.4,
  chestWidth: 0.35,
  waistWidth: 0.3,
  hipWidth: 0.32,
};

describe("sdEllipsoid", () => {
  const center: [number, number, number] = [0, 0, 0];
  const radii: [number, number, number] = [2, 1, 1];

  // Input: The center point and ellipsoid radii [2, 1, 1]
  // Expected behavior: The function handles the zero-distance special case
  // Expected output: Negative minimum radius (-1)
  it("returns the negative minimum radius at the center", () => {
    expect(sdEllipsoid(0, 0, 0, center, radii)).toBe(-1);
  });

  // Input: Point (3, 0, 0) with radii [2, 1, 1]
  // Expected behavior: The point is classified as outside the ellipsoid
  // Expected output: Positive distance
  it("returns a positive distance outside the ellipsoid", () => {
    expect(sdEllipsoid(3, 0, 0, center, radii)).toBeGreaterThan(0);
  });

  // Input: Point (0, 0.5, 0) with radii [2, 1, 1]
  // Expected behavior: The point is classified as inside the ellipsoid
  // Expected output: Negative distance
  it("returns a negative distance inside the ellipsoid", () => {
    expect(sdEllipsoid(0, 0.5, 0, center, radii)).toBeLessThan(0);
  });
});

describe("sdRoundedBox", () => {
  const center: [number, number, number] = [0, 0, 0];
  const halfSize: [number, number, number] = [1, 1, 1];

  // Input: Point (0, 0, 0), half-size [1, 1, 1], radius 0.2
  // Expected behavior: The point is classified as inside the box
  // Expected output: Negative distance
  it("returns a negative distance inside the box", () => {
    expect(sdRoundedBox(0, 0, 0, center, halfSize, 0.2)).toBeLessThan(0);
  });

  // Input: Point (2, 0, 0), half-size [1, 1, 1], radius 0.2
  // Expected behavior: The point is classified as outside the box
  // Expected output: Positive distance
  it("returns a positive distance outside the box", () => {
    expect(sdRoundedBox(2, 0, 0, center, halfSize, 0.2)).toBeGreaterThan(0);
  });

  // Input: Point (2, 2, 2), half-size [1, 1, 1], radius 0.2
  // Expected behavior: The distance calculation accounts for multiple positive offsets
  // Expected output: Positive distance
  it("handles a point outside multiple axes", () => {
    expect(sdRoundedBox(2, 2, 2, center, halfSize, 0.2)).toBeGreaterThan(0);
  });
});

describe("sdCapsule", () => {
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 2, 0];

  // Input: Point (0, 1, 0), segment from (0, 0, 0) to (0, 2, 0), radius 0.5
  // Expected behavior: The point lies within the capsule
  // Expected output: Distance -0.5
  it("returns a negative distance near the segment", () => {
    expect(sdCapsule(0, 1, 0, a, b, 0.5)).toBe(-0.5);
  });

  // Input: Point (2, 1, 0), segment from (0, 0, 0) to (0, 2, 0), radius 0.5
  // Expected behavior: The point is classified as outside the capsule
  // Expected output: Positive distance
  it("returns a positive distance away from the segment", () => {
    expect(sdCapsule(2, 1, 0, a, b, 0.5)).toBeGreaterThan(0);
  });

  // Input: Point (0, -1, 0), segment from (0, 0, 0) to (0, 2, 0), radius 0.5
  // Expected behavior: The projection parameter is clamped to 0
  // Expected output: Distance 0.5
  it("clamps projection before the start of the segment", () => {
    expect(sdCapsule(0, -1, 0, a, b, 0.5)).toBe(0.5);
  });

  // Input: Point (0, 3, 0), segment from (0, 0, 0) to (0, 2, 0), radius 0.5
  // Expected behavior: The projection parameter is clamped to 1
  // Expected output: Distance 0.5
  it("clamps projection after the end of the segment", () => {
    expect(sdCapsule(0, 3, 0, a, b, 0.5)).toBe(0.5);
  });

  // Input: Point (1, 0, 0), both endpoints at (0, 0, 0), radius 0.5
  // Expected behavior: The zero-length segment avoids division by zero
  // Expected output: Distance 0.5
  it("handles a zero-length segment", () => {
    expect(sdCapsule(1, 0, 0, a, a, 0.5)).toBe(0.5);
  });
});

describe("smoothMin", () => {
  // Input: Distances 1 and 2, blend factor 0
  // Expected behavior: The function falls back to Math.min
  // Expected output: 1
  it("uses Math.min when blend factor is zero", () => {
    expect(smoothMin(1, 2, 0)).toBe(1);
  });

  // Input: Distances 1 and 2, blend factor -1
  // Expected behavior: The function falls back to Math.min
  // Expected output: 1
  it("uses Math.min when blend factor is negative", () => {
    expect(smoothMin(1, 2, -1)).toBe(1);
  });

  // Input: Distances 1 and 1, blend factor 0.5
  // Expected behavior: The function applies smooth blending
  // Expected output: A value less than 1
  it("smoothly blends nearby distances", () => {
    expect(smoothMin(1, 1, 0.5)).toBeLessThan(1);
  });

  // Input: Distances 1 and 3, blend factor 0.5
  // Expected behavior: The smoothing term becomes zero
  // Expected output: 1
  it("does not blend distances farther apart than k", () => {
    expect(smoothMin(1, 3, 0.5)).toBe(1);
  });

  // Input: Distances 2 and 2, blend factor 1
  // Expected behavior: The function applies the full smoothing adjustment
  // Expected output: 1.75
  it("handles equal distances", () => {
    expect(smoothMin(2, 2, 1)).toBe(1.75);
  });
});

describe("avatarSDF", () => {
  // Input: Point (0, 1.35, 0) and custom avatar dimensions
  // Expected behavior: The point is classified as inside the avatar
  // Expected output: Negative distance
  it("returns a negative distance for a point inside the torso", () => {
    expect(avatarSDF(0, 1.35, 0, params)).toBeLessThan(0);
  });

  // Input: Point (10, 10, 10) and custom avatar dimensions
  // Expected behavior: The point is classified as outside the avatar
  // Expected output: Positive distance
  it("returns a positive distance far outside the avatar", () => {
    expect(avatarSDF(10, 10, 10, params)).toBeGreaterThan(0);
  });

  // Input: Points around the torso, head, legs, and far outside the avatar
  // Expected behavior: All distance calculations produce finite values
  // Expected output: Every result is finite
  it("returns finite distances for representative points", () => {
    const points: [number, number, number][] = [
      [0, 1.35, 0],
      [0, 1.7, 0],
      [0.2, 1.0, 0],
      [10, 10, 10],
    ];

    for (const [x, y, z] of points) {
      expect(Number.isFinite(avatarSDF(x, y, z, params))).toBe(true);
    }
  });
});
