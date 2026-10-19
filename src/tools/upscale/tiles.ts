/*
 * Real-ESRGAN works tile by tile so memory stays small and progress can be
 * shown. Each tile is fed with a margin of real neighbouring pixels (PAD) and
 * only its core is kept, so no seams show where tiles meet.
 */
export const MODEL_SCALE = 4;
export const TILE = 128;
export const PAD = 10;
/** Browsers (iOS Safari especially) refuse canvases above about 16.7 million pixels. */
export const MAX_OUTPUT_PIXELS = 16_000_000;

export type Tile = {
  /** The core this tile is responsible for. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The region fed to the model: the core plus up to PAD pixels around it. */
  px: number;
  py: number;
  pw: number;
  ph: number;
};

export function planTiles(width: number, height: number, tile = TILE, pad = PAD): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const w = Math.min(tile, width - x);
      const h = Math.min(tile, height - y);
      const px = Math.max(0, x - pad);
      const py = Math.max(0, y - pad);
      tiles.push({ x, y, w, h, px, py, pw: Math.min(width, x + w + pad) - px, ph: Math.min(height, y + h + pad) - py });
    }
  }
  return tiles;
}

export function fitsOutput(width: number, height: number, scale: number): boolean {
  return width * scale * height * scale <= MAX_OUTPUT_PIXELS;
}

/** Copies a rectangle out of an RGBA buffer `stride` pixels wide. */
export function crop(rgba: Uint8ClampedArray, stride: number, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * stride + x) * 4;
    out.set(rgba.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

/** RGBA bytes -> planar RGB floats in 0..1 (the model's input). */
export function toPlanar(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4] / 255;
    out[n + i] = rgba[i * 4 + 1] / 255;
    out[2 * n + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

/** Planar RGB floats (clamped to 0..1) -> opaque RGBA bytes. */
export function fromPlanar(data: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const n = data.length / 3;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(data[i] * 255); // Uint8ClampedArray clamps out-of-range values
    out[i * 4 + 1] = Math.round(data[n + i] * 255);
    out[i * 4 + 2] = Math.round(data[2 * n + i] * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
