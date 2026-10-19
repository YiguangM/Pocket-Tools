import { describe, expect, it } from "vitest";
import { maskToRgba, normalizeMask, toInput } from "./tensor";

describe("toInput", () => {
  it("divides by the brightest value, applies mean/std and goes planar", () => {
    // 2x1 image: pure red at full brightness, then black
    const rgba = Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 0, 255]);
    const t = toInput(rgba);
    const n = 2;
    expect(t).toHaveLength(6);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229); // R of pixel 0
    expect(t[1]).toBeCloseTo((0 - 0.485) / 0.229); // R of pixel 1
    expect(t[n]).toBeCloseTo((0 - 0.456) / 0.224); // G plane starts at n
    expect(t[2 * n]).toBeCloseTo((0 - 0.406) / 0.225); // B plane
  });

  it("treats a dim image as if its brightest value were white", () => {
    const dim = toInput(Uint8ClampedArray.from([100, 50, 0, 255]));
    expect(dim[0]).toBeCloseTo((1 - 0.485) / 0.229);
    expect(dim[1]).toBeCloseTo((0.5 - 0.456) / 0.224);
  });

  it("copes with an all-black image", () => {
    expect(toInput(new Uint8ClampedArray(4)).every(Number.isFinite)).toBe(true);
  });
});

describe("mask helpers", () => {
  it("min-max scales the model output", () => {
    expect(Array.from(normalizeMask(Float32Array.from([0.2, 0.4, 0.6])))).toEqual([0, expect.closeTo(0.5), 1]);
  });

  it("handles a flat output without dividing by zero", () => {
    expect(Array.from(normalizeMask(Float32Array.from([0.3, 0.3])))).toEqual([0, 0]);
  });

  it("puts the mask in the alpha channel", () => {
    expect(Array.from(maskToRgba(Float32Array.from([0, 1])))).toEqual([0, 0, 0, 0, 0, 0, 0, 255]);
  });
});
