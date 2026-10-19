import { PDFDocument } from "pdf-lib";
import { APP_NAME } from "../../shared/lib/useDocumentTitle";

export type PageSize = "fit" | "a4" | "letter";
/** An encoded image ready to place: PNG keeps transparency, JPEG keeps photos small. */
export type PageImage = { data: Uint8Array; kind: "jpeg" | "png"; width: number; height: number };

const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const; // points
export const MARGIN = 36; // half an inch
/** Images are shown at 96 pixels per inch at most (1 px = 0.75 pt), so small ones aren't blown up and blurred. */
const PT_PER_PX = 0.75;

/** Page size and image rectangle, in points. Paper turns landscape for wide images. */
export function placeImage(width: number, height: number, size: PageSize) {
  if (size === "fit") {
    const w = width * PT_PER_PX;
    const h = height * PT_PER_PX;
    return { page: [w, h] as [number, number], x: 0, y: 0, width: w, height: h };
  }
  const [short, long] = PAPER[size];
  const [pw, ph] = width > height ? [long, short] : [short, long];
  const scale = Math.min((pw - 2 * MARGIN) / width, (ph - 2 * MARGIN) / height, PT_PER_PX);
  const w = width * scale;
  const h = height * scale;
  return { page: [pw, ph] as [number, number], x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h };
}

/** One page per image, in order. */
export async function imagesToPdf(images: PageImage[], size: PageSize, signal?: AbortSignal): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const image of images) {
    signal?.throwIfAborted();
    const embedded = image.kind === "png" ? await doc.embedPng(image.data) : await doc.embedJpg(image.data);
    const { page, ...rect } = placeImage(image.width, image.height, size);
    doc.addPage(page).drawImage(embedded, rect);
  }
  doc.setProducer(APP_NAME);
  doc.setCreator(APP_NAME);
  return doc.save();
}
