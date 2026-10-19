import { predictMask } from "./model";
import { maskToRgba, MODEL_SIZE } from "./tensor";

/* iOS Safari refuses canvases above about 16.7 million pixels. */
const MAX_PIXELS = 16_000_000;

export type Cutout = { blob: Blob; url: string; width: number; height: number };

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Cuts the subject out of a photo: the model looks at a 320×320 copy, and its
 * mask is scaled back up and applied to the full-size image as transparency.
 * The result is a PNG (redrawn, so hidden metadata is gone too).
 */
export async function removeBackground(file: File): Promise<Cutout> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const small = canvas(MODEL_SIZE, MODEL_SIZE);
  const maskCanvas = canvas(MODEL_SIZE, MODEL_SIZE);
  const out = canvas(width, height);
  try {
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(bitmap, 0, 0, MODEL_SIZE, MODEL_SIZE);
    const mask = await predictMask(sctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data);
    maskCanvas.getContext("2d")!.putImageData(new ImageData(maskToRgba(mask), MODEL_SIZE, MODEL_SIZE), 0, 0);

    const octx = out.getContext("2d")!;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(bitmap, 0, 0, width, height);
    octx.globalCompositeOperation = "destination-in"; // keep the photo only where the mask is
    octx.drawImage(maskCanvas, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Couldn't encode the cutout.");
    return { blob, url: URL.createObjectURL(blob), width, height };
  } finally {
    bitmap.close();
    for (const c of [small, maskCanvas, out]) c.width = c.height = 0;
  }
}

/** Puts a cutout on a solid colour (JPG) or keeps it transparent (PNG). */
export async function finish(cutout: Cutout, background: string | null): Promise<{ blob: Blob; ext: string }> {
  if (!background) return { blob: cutout.blob, ext: "png" };
  const bitmap = await createImageBitmap(cutout.blob);
  const c = canvas(cutout.width, cutout.height);
  try {
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("Couldn't encode the image.");
    return { blob, ext: "jpg" };
  } finally {
    bitmap.close();
    c.width = c.height = 0;
  }
}
