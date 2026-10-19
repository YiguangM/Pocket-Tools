import { describe, expect, it } from "vitest";
import { crop, fitsOutput, fromPlanar, planTiles, toPlanar } from "./tiles";

describe("planTiles", () => {
  it("covers every pixel exactly once with cores", () => {
    const [w, h] = [300, 200];
    const seen = new Uint8Array(w * h);
    for (const t of planTiles(w, h, 128, 10)) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) seen[y * w + x]++;
    expect(seen.every((n) => n === 1)).toBe(true);
  });

  it("pads tiles with neighbours but stays inside the image", () => {
    const tiles = planTiles(300, 200, 128, 10);
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toEqual({ x: 0, y: 0, w: 128, h: 128, px: 0, py: 0, pw: 138, ph: 138 });
    expect(tiles[4]).toEqual({ x: 128, y: 128, w: 128, h: 72, px: 118, py: 118, pw: 148, ph: 82 });
    for (const t of tiles) expect(t.px + t.pw <= 300 && t.py + t.ph <= 200).toBe(true);
  });

  it("handles images smaller than one tile", () => {
    expect(planTiles(50, 40)).toEqual([{ x: 0, y: 0, w: 50, h: 40, px: 0, py: 0, pw: 50, ph: 40 }]);
  });
});

describe("pixel helpers", () => {
  it("crops a rectangle", () => {
    // 3x2 image, pixel value = index
    const img = Uint8ClampedArray.from({ length: 24 }, (_, i) => Math.floor(i / 4));
    expect(Array.from(crop(img, 3, 1, 0, 2, 2)).filter((_, i) => i % 4 === 0)).toEqual([1, 2, 4, 5]);
  });

  it("round-trips RGB through planar floats and clamps model overshoot", () => {
    const rgba = Uint8ClampedArray.from([255, 128, 0, 99, 10, 20, 30, 99]);
    const planar = toPlanar(rgba);
    expect(planar[0]).toBeCloseTo(1);
    expect(planar[2]).toBeCloseTo(128 / 255); // G plane of pixel 0
    expect(Array.from(fromPlanar(planar))).toEqual([255, 128, 0, 255, 10, 20, 30, 255]);
    expect(Array.from(fromPlanar(Float32Array.from([1.2, -0.1, 0.5])))).toEqual([255, 0, 128, 255]);
  });

  it("refuses outputs past the canvas limit", () => {
    expect(fitsOutput(1000, 1000, 4)).toBe(true);
    expect(fitsOutput(2000, 1500, 4)).toBe(false);
    expect(fitsOutput(2000, 1500, 2)).toBe(true);
  });
});
