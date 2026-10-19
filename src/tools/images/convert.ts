import { readMetadata, type PhotoMetadata } from "./metadata";
import { outputType, targetSize, type OutFormat, type Resize } from "./output";

/** An image the user added, kept in memory only. */
export type ImageItem = {
  id: number;
  file: File;
  /** blob: URL of the original, for thumbnails and the preview. */
  url: string;
  width: number;
  height: number;
  meta: PhotoMetadata;
};

let lastId = 0;

/** Decodes the file once to check it opens and to learn its size, and reads its hidden data. */
export async function openImage(file: File): Promise<ImageItem> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = bitmap;
  bitmap.close();
  const meta = readMetadata(new Uint8Array(await file.arrayBuffer()));
  return { id: ++lastId, file, url: URL.createObjectURL(file), width, height, meta };
}

export type ConvertOptions = { format: OutFormat; quality: number; resize: Resize };

/**
 * Redraws the image and encodes it again. Only pixels survive the redraw, so
 * EXIF, GPS, XMP and every other kind of hidden data is gone from the result.
 * Photos are turned upright first, since their orientation tag goes too.
 */
export async function convertImage(item: ImageItem, { format, quality, resize }: ConvertOptions): Promise<{ blob: Blob; ext: string; width: number; height: number }> {
  const type = outputType(format, item.file.type);
  const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
  const size = targetSize(bitmap.width, bitmap.height, resize);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const ctx = canvas.getContext("2d")!;
    if (type.mime === "image/jpeg") {
      ctx.fillStyle = "#fff"; // JPG has no transparency; show see-through areas as white, not black
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type.mime, type.lossy ? quality / 100 : undefined));
    // Browsers quietly fall back to PNG for formats they can't write.
    if (!blob || blob.type !== type.mime) throw new Error(`This browser can't save ${type.ext.toUpperCase()} files.`);
    return { blob, ext: type.ext, ...size };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
