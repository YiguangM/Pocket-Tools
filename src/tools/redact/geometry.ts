/*
 * Pure decoding for the three detectors, ported from (and checked against)
 * each project's reference code:
 *  - YuNet (OpenCV, MIT): faces, grid outputs at strides 8/16/32.
 *  - YOLOv9-t license plates (open-image-models, MIT): rows [batch, x1, y1, x2, y2, class, score].
 *  - PP-OCRv4 text detection (PaddleOCR / RapidOCR, Apache-2.0): a probability map.
 */
export type Box = { x1: number; y1: number; x2: number; y2: number; score: number };

const area = (b: Box) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
function overlap(a: Box, b: Box) {
  return Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
}
export const iou = (a: Box, b: Box) => overlap(a, b) / (area(a) + area(b) - overlap(a, b) || 1);

/** Keeps the best box of each overlapping group. */
export function nms(boxes: Box[], threshold: number): Box[] {
  const keep: Box[] = [];
  for (const b of [...boxes].sort((p, q) => q.score - p.score)) if (keep.every((k) => iou(b, k) < threshold)) keep.push(b);
  return keep;
}

/** Drops boxes that sit mostly inside a bigger one (e.g. half a face found in a tile). */
export function dropContained(boxes: Box[], ratio = 0.6): Box[] {
  const keep: Box[] = [];
  for (const b of [...boxes].sort((p, q) => area(q) - area(p))) if (keep.every((k) => overlap(b, k) / (area(b) || 1) <= ratio)) keep.push(b);
  return keep;
}

/** How an image was placed into a square model input: scaled by `scale`, offset by (dx, dy). */
export type Placement = { scale: number; dx: number; dy: number };

export function letterbox(width: number, height: number, size: number, center: boolean): Placement & { w: number; h: number } {
  const scale = Math.min(size / width, size / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { scale, w, h, dx: center ? Math.round((size - w) / 2) : 0, dy: center ? Math.round((size - h) / 2) : 0 };
}

/** Model-input coordinates -> source coordinates (plus an offset, for tiles). */
export function mapBack(b: Box, p: Placement, ox = 0, oy = 0): Box {
  return { x1: (b.x1 - p.dx) / p.scale + ox, y1: (b.y1 - p.dy) / p.scale + oy, x2: (b.x2 - p.dx) / p.scale + ox, y2: (b.y2 - p.dy) / p.scale + oy, score: b.score };
}

/** RGBA bytes -> planar float input, with channel order and normalization per model. */
export function toTensor(rgba: Uint8ClampedArray, opts: { bgr: boolean; scale: number; mean?: number[]; std?: number[] }): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(3 * n);
  const order = opts.bgr ? [2, 1, 0] : [0, 1, 2];
  for (let c = 0; c < 3; c++) {
    const src = order[c];
    const mean = opts.mean?.[c] ?? 0;
    const std = opts.std?.[c] ?? 1;
    for (let i = 0; i < n; i++) out[c * n + i] = (rgba[i * 4 + src] * opts.scale - mean) / std;
  }
  return out;
}

export const YUNET_SIZE = 640;

/** YuNet outputs -> face boxes in the 640×640 input. Same maths as OpenCV's FaceDetectorYN. */
export function decodeYunet(out: Record<string, Float32Array>, threshold: number): Box[] {
  const boxes: Box[] = [];
  for (const stride of [8, 16, 32]) {
    const cols = YUNET_SIZE / stride;
    const cls = out[`cls_${stride}`];
    const obj = out[`obj_${stride}`];
    const bbox = out[`bbox_${stride}`];
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < threshold) continue;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const cx = (col + bbox[i * 4]) * stride;
      const cy = (row + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride;
      const h = Math.exp(bbox[i * 4 + 3]) * stride;
      boxes.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, score });
    }
  }
  return boxes;
}

export const PLATE_SIZE = 384;

/**
 * Real plates are small and wider than tall. The model sometimes answers a
 * photo with no car with one huge box; this drops such finds.
 */
export function plausiblePlate(b: Box, imageWidth: number, imageHeight: number): boolean {
  const w = b.x2 - b.x1;
  const h = b.y2 - b.y1;
  return w > 0 && h > 0 && (w * h) / (imageWidth * imageHeight) <= 0.15 && w / h >= 0.8 && w / h <= 10;
}

/** End-to-end YOLO rows -> plate boxes in the 384×384 input. */
export function decodePlates(rows: Float32Array, threshold: number): Box[] {
  const boxes: Box[] = [];
  for (let i = 0; i + 7 <= rows.length; i += 7) {
    if (rows[i + 6] >= threshold) boxes.push({ x1: rows[i + 1], y1: rows[i + 2], x2: rows[i + 3], y2: rows[i + 4], score: rows[i + 6] });
  }
  return boxes;
}

/**
 * Text probability map -> word/line boxes in map coordinates: threshold,
 * group touching pixels, keep confident groups and grow each box a little
 * (DBNet's "unclip") so blurring covers whole letters.
 */
export function textBoxes(prob: Float32Array, width: number, height: number, opts = { threshold: 0.3, boxThreshold: 0.6, unclip: 2, minPixels: 10 }): Box[] {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const boxes: Box[] = [];
  for (let start = 0; start < prob.length; start++) {
    if (seen[start] || prob[start] <= opts.threshold) continue;
    let x1 = width, y1 = height, x2 = 0, y2 = 0, sum = 0, count = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      sum += prob[p];
      count++;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q >= 0 && q < prob.length && !seen[q] && prob[q] > opts.threshold) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    const score = sum / count;
    if (count < opts.minPixels || score < opts.boxThreshold) continue;
    const w = x2 + 1 - x1;
    const h = y2 + 1 - y1;
    const grow = (w * h * opts.unclip) / (2 * (w + h));
    boxes.push({ x1: x1 - grow, y1: y1 - grow, x2: x2 + 1 + grow, y2: y2 + 1 + grow, score });
  }
  return boxes;
}

/** Size of the canvas that holds a width×height image turned by `degrees` without clipping. */
export function rotatedSize(width: number, height: number, degrees: number) {
  const t = (degrees * Math.PI) / 180;
  const [c, s] = [Math.abs(Math.cos(t)), Math.abs(Math.sin(t))];
  return { w: Math.round(width * c + height * s), h: Math.round(width * s + height * c) };
}

/**
 * A box found in the turned copy (turned `degrees` clockwise about its centre)
 * -> the smallest upright box around the same area in the original image.
 */
export function unrotateBox(b: Box, degrees: number, width: number, height: number): Box {
  const { w, h } = rotatedSize(width, height, degrees);
  const t = (-degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(t), Math.sin(t)];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [[b.x1, b.y1], [b.x2, b.y1], [b.x1, b.y2], [b.x2, b.y2]]) {
    const [dx, dy] = [px - w / 2, py - h / 2];
    xs.push(dx * cos - dy * sin + width / 2);
    ys.push(dx * sin + dy * cos + height / 2);
  }
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return { x1: clamp(Math.min(...xs), width), y1: clamp(Math.min(...ys), height), x2: clamp(Math.max(...xs), width), y2: clamp(Math.max(...ys), height), score: b.score };
}

/** Overlapping square tiles over an image, for finding small faces. */
export function tiles(width: number, height: number, size: number, overlap: number): { x: number; y: number; x2: number; y2: number }[] {
  const out = [];
  const step = size - overlap;
  for (let y = 0; y < Math.max(1, height - overlap); y += step) {
    for (let x = 0; x < Math.max(1, width - overlap); x += step) out.push({ x, y, x2: Math.min(width, x + size), y2: Math.min(height, y + size) });
  }
  return out;
}

/** True when a box touches a tile edge that isn't the image edge: the face was cut, and a neighbour has it whole. */
export function cutByTile(b: Box, t: { x: number; y: number; x2: number; y2: number }, width: number, height: number, margin = 3): boolean {
  return (t.x > 0 && b.x1 < t.x + margin) || (t.y > 0 && b.y1 < t.y + margin) || (t.x2 < width && b.x2 > t.x2 - margin) || (t.y2 < height && b.y2 > t.y2 - margin);
}
