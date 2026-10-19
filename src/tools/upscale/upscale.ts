import { crop, fitsOutput, fromPlanar, MODEL_SCALE, planTiles, toPlanar } from "./tiles";
import type { TileRequest, TileResponse } from "./worker";

let worker: Worker | null = null;
let lastId = 0;
const pending = new Map<number, { resolve: (data: Float32Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<TileResponse>) => {
    const job = pending.get(data.id);
    pending.delete(data.id);
    if (data.data) job?.resolve(data.data);
    else job?.reject(new Error(data.error ?? "The upscaler failed."));
  };
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error("The upscaler stopped unexpectedly."));
    pending.clear();
    worker = null;
  };
  return worker;
}

function upscaleTile(data: Float32Array, width: number, height: number): Promise<Float32Array> {
  const id = ++lastId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, data, width, height } satisfies TileRequest, [data.buffer]);
  });
}

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export class TooLargeError extends Error {}

export type Upscaled = { blob: Blob; url: string; width: number; height: number };

/**
 * Upscales an image 2x or 4x with Real-ESRGAN. The model always works at 4x;
 * for 2x each finished tile is scaled down as it is placed. Transparency is
 * carried over by enlarging the original alpha smoothly.
 */
export async function upscaleImage(
  file: File,
  scale: 2 | 4,
  type: "image/png" | "image/jpeg",
  onTile: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<Upscaled> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = bitmap;
  if (!fitsOutput(width, height, scale)) {
    bitmap.close();
    throw new TooLargeError(`${file.name} is too large to make ${scale}x bigger in a browser.`);
  }
  const source = canvas(width, height);
  const out = canvas(width * scale, height * scale);
  const piece = canvas(1, 1);
  try {
    const sctx = source.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(bitmap, 0, 0);
    const pixels = sctx.getImageData(0, 0, width, height).data;
    let transparent = false;
    for (let i = 3; i < pixels.length && !transparent; i += 4) transparent = pixels[i] < 255;

    const octx = out.getContext("2d")!;
    octx.imageSmoothingQuality = "high";
    const tiles = planTiles(width, height);
    for (const [k, t] of tiles.entries()) {
      signal.throwIfAborted();
      const result = await upscaleTile(toPlanar(crop(pixels, width, t.px, t.py, t.pw, t.ph)), t.pw, t.ph);
      piece.width = t.pw * MODEL_SCALE;
      piece.height = t.ph * MODEL_SCALE;
      piece.getContext("2d")!.putImageData(new ImageData(fromPlanar(result), piece.width, piece.height), 0, 0);
      // keep only the tile's core, dropping the padding
      octx.drawImage(
        piece,
        (t.x - t.px) * MODEL_SCALE,
        (t.y - t.py) * MODEL_SCALE,
        t.w * MODEL_SCALE,
        t.h * MODEL_SCALE,
        t.x * scale,
        t.y * scale,
        t.w * scale,
        t.h * scale,
      );
      onTile(k + 1, tiles.length);
    }

    if (transparent) {
      octx.globalCompositeOperation = "destination-in"; // apply the original's (enlarged) transparency
      octx.drawImage(bitmap, 0, 0, out.width, out.height);
    }
    if (type === "image/jpeg") {
      octx.globalCompositeOperation = "destination-over"; // JPG can't be see-through: white behind
      octx.fillStyle = "#fff";
      octx.fillRect(0, 0, out.width, out.height);
    }
    signal.throwIfAborted();
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, 0.92));
    if (!blob) throw new Error("Couldn't encode the result.");
    return { blob, url: URL.createObjectURL(blob), width: out.width, height: out.height };
  } finally {
    bitmap.close();
    for (const c of [source, out, piece]) c.width = c.height = 0;
  }
}
