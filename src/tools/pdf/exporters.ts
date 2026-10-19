import { zipSync } from "fflate";
import { formatBytes, plural } from "../../shared/lib/format";
import { buildPdf, type SourceCache } from "./build";
import type { LoadedDoc } from "./model";
import { chunk, imageFileName, imagesZipName, partFileName, pdfFileName, zipFileName } from "./output";
import { IMAGE_TYPES, rasterizePage, renderImage, type ImageType, type Quality } from "./pdfjs";

/** A page to export, in output order, with the user's rotation. */
export type ExportPage = { doc: LoadedDoc; index: number; rot: number };
/** What to download, plus the words that follow "Saved" in the status line. */
export type ExportResult = { filename: string; data: Uint8Array; type: string; summary: string };

type Common = {
  /** Stem for file names, from baseName(). */
  base: string;
  signal: AbortSignal;
  /** fraction runs 0..1; label says where we are. */
  onProgress: (fraction: number, label: string) => void;
};
type PdfOptions = Common & { compress: boolean; quality: Quality };

const rasterizer = (quality: Quality) => (p: ExportPage) => rasterizePage(p.doc.pdf, p.index, p.rot, quality);

/** One PDF from the pages. */
export async function exportPdf(
  pages: ExportPage[],
  { mode, docs, compress, quality, base, signal, onProgress }: PdfOptions & { mode: "all" | "selected" | "range"; docs: LoadedDoc[] },
): Promise<ExportResult> {
  const data = await buildPdf(pages, {
    signal,
    rasterize: compress ? rasterizer(quality) : undefined,
    onProgress: (done, total) => onProgress(done / total, `page ${done} of ${total}`),
  });
  const filename = pdfFileName(mode, base, docs.length);
  const before = docs.reduce((sum, d) => sum + d.bytes.length, 0);
  const summary = `${filename} (${formatBytes(data.length)})` + (compress && mode === "all" ? `, from ${formatBytes(before)}` : "");
  return { filename, data, type: "application/pdf", summary };
}

/** A ZIP of PDFs with `size` pages each. */
export async function exportSplit(pages: ExportPage[], { size, compress, quality, base, signal, onProgress }: PdfOptions & { size: number }): Promise<ExportResult> {
  const parts = chunk(pages, size);
  const sources: SourceCache = new Map(); // parse each file once for all parts
  const files: Record<string, Uint8Array> = {};
  for (const [k, part] of parts.entries()) {
    files[partFileName(base, k + 1)] = await buildPdf(part, {
      signal,
      sources,
      rasterize: compress ? rasterizer(quality) : undefined,
      onProgress: (done, total) => onProgress((k + done / total) / parts.length, `file ${k + 1} of ${parts.length}`),
    });
  }
  const data = zipSync(files, { level: 0 }); // PDFs are already compressed; just store them
  return { filename: zipFileName(base), data, type: "application/zip", summary: `${parts.length} files in a ZIP (${formatBytes(data.length)})` };
}

/** One image per page; a single image downloads as is, several come in a ZIP. */
export async function exportImages(
  pages: ExportPage[],
  { imageType, dpi, base, signal, onProgress }: Common & { imageType: ImageType; dpi: number },
): Promise<ExportResult> {
  const { ext, mime } = IMAGE_TYPES[imageType];
  const files: Record<string, Uint8Array> = {};
  for (const [k, p] of pages.entries()) {
    signal.throwIfAborted();
    const blob = await renderImage(p.doc.pdf, p.index, p.rot, imageType, dpi);
    files[imageFileName(base, k + 1, pages.length, ext)] = new Uint8Array(await blob.arrayBuffer());
    onProgress((k + 1) / pages.length, `page ${k + 1} of ${pages.length}`);
  }
  signal.throwIfAborted();
  const names = Object.keys(files);
  if (names.length === 1) {
    const data = files[names[0]];
    return { filename: names[0], data, type: mime, summary: `${names[0]} (${formatBytes(data.length)})` };
  }
  const data = zipSync(files, { level: 0 }); // PNG and JPG are already compressed
  return { filename: imagesZipName(base), data, type: "application/zip", summary: `${plural(names.length, "image")} in a ZIP (${formatBytes(data.length)})` };
}
