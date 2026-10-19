/*
 * Pre- and post-processing for U²-Net (u2netp), matching backgroundremover's
 * Python pipeline: resize to 320×320, divide by the brightest value, apply
 * ImageNet mean/std; then min-max scale the first output into a 0..1 mask.
 */
export const MODEL_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** RGBA pixels (a MODEL_SIZE² image) -> planar RGB float input (1×3×H×W). */
export function toInput(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  const scale = max > 0 ? 1 / max : 0;
  const out = new Float32Array(3 * n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) out[c * n + i] = (rgba[i * 4 + c] * scale - MEAN[c]) / STD[c];
  }
  return out;
}

/** Scales raw model output to 0..1 (backgroundremover's norm_pred). */
export function normalizeMask(raw: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const v of raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  return raw.map((v) => (v - min) / range);
}

/** A 0..1 mask -> RGBA pixels whose alpha is the mask, for compositing on a canvas. */
export function maskToRgba(mask: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) out[i * 4 + 3] = Math.round(mask[i] * 255);
  return out;
}
