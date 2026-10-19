import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { RasterPage } from "./build";

GlobalWorkerOptions.workerSrc = workerUrl;

// Served from our own origin (see pdfjsAssets in vite.config.ts), never a CDN.
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

/* iOS Safari refuses canvases above about 16.7 million pixels. */
const MAX_CANVAS_PIXELS = 16_000_000;

export function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data: bytes.slice(), // pdf.js hands this buffer to its worker, so keep our own copy intact
    cMapUrl: `${ASSETS}cmaps/`,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  }).promise;
}

export function isPasswordError(e: unknown): boolean {
  return e instanceof Error && e.name === "PasswordException";
}

/** Draws a page with `rot` added to its own rotation. Cancels the render if `signal` aborts. */
export async function renderPage(page: PDFPageProxy, scale: number, rot = 0, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const rotation = (page.rotate + rot) % 360;
  const unit = page.getViewport({ scale: 1, rotation });
  const safeScale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (unit.width * unit.height)));
  const viewport = page.getViewport({ scale: safeScale, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const task = page.render({ canvas, viewport });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel);
  try {
    await task.promise;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the page."))), type, quality));
}

/** Frees a canvas's pixel memory right away instead of waiting for garbage collection. */
function release(canvas: HTMLCanvasElement) {
  canvas.width = canvas.height = 0;
}

/** A small JPEG of the page at its own rotation; the grid applies the user's rotation with CSS. */
export async function renderThumbnail(pdf: PDFDocumentProxy, index: number): Promise<Blob> {
  const page = await pdf.getPage(index + 1);
  const unit = page.getViewport({ scale: 1 });
  const canvas = await renderPage(page, Math.min(2, 360 / Math.max(unit.width, unit.height)));
  try {
    return await canvasToBlob(canvas, "image/jpeg", 0.78);
  } finally {
    release(canvas);
    page.cleanup();
  }
}

export const QUALITY = {
  high: { scale: 2, jpeg: 0.82 },
  medium: { scale: 1.4, jpeg: 0.65 },
  low: { scale: 1, jpeg: 0.5 },
} as const;
export type Quality = keyof typeof QUALITY;

export const IMAGE_TYPES = {
  png: { mime: "image/png", ext: "png" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** Draws a page as a standalone image at `dpi`, with the user's rotation applied. */
export async function renderImage(pdf: PDFDocumentProxy, index: number, rot: number, type: ImageType, dpi: number): Promise<Blob> {
  const page = await pdf.getPage(index + 1);
  const canvas = await renderPage(page, dpi / 72, rot); // at scale 1, one PDF point is one pixel: 72 dpi
  try {
    return await canvasToBlob(canvas, IMAGE_TYPES[type].mime, type === "jpeg" ? 0.9 : undefined);
  } finally {
    release(canvas);
    page.cleanup();
  }
}

/** Draws a page as a JPEG for the Compress option. Size is in PDF points, with rotation applied. */
export async function rasterizePage(pdf: PDFDocumentProxy, index: number, rot: number, quality: Quality): Promise<RasterPage> {
  const { scale, jpeg } = QUALITY[quality];
  const page = await pdf.getPage(index + 1);
  const size = page.getViewport({ scale: 1, rotation: (page.rotate + rot) % 360 });
  const canvas = await renderPage(page, scale, rot);
  try {
    const blob = await canvasToBlob(canvas, "image/jpeg", jpeg);
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: size.width, height: size.height };
  } finally {
    release(canvas);
    page.cleanup();
  }
}
