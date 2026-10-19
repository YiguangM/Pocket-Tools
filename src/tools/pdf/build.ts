import { degrees, PDFDocument, type PDFPage } from "pdf-lib";

export const PRODUCER = "Pocket Tools";

export type SourceDoc = { id: number; name: string; bytes: Uint8Array };
export type OutputPage = { doc: SourceDoc; index: number; rot: number };
/** A page drawn as a JPEG. width and height are in PDF points, rotation already applied. */
export type RasterPage = { jpeg: Uint8Array; width: number; height: number };
/** Parsed sources, shared between builds so a split loads each file once. */
export type SourceCache = Map<number, Promise<PDFDocument>>;

export type BuildOptions<P extends OutputPage = OutputPage> = {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** When set, every page is drawn as a picture instead of copied (the Compress option). */
  rasterize?: (page: P) => Promise<RasterPage>;
  sources?: SourceCache;
};

/** pdf-lib can't decrypt, so copying pages out of an encrypted file would produce garbage. */
export class EncryptedSourceError extends Error {
  constructor(readonly docName: string) {
    super(`${docName} is encrypted`);
    this.name = "EncryptedSourceError";
  }
}

function loadSource(doc: SourceDoc, cache: SourceCache): Promise<PDFDocument> {
  let loading = cache.get(doc.id);
  if (!loading) {
    loading = PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false }).then((src) => {
      if (src.isEncrypted) throw new EncryptedSourceError(doc.name);
      return src;
    });
    cache.set(doc.id, loading);
  }
  return loading;
}

/**
 * Assembles a new PDF from pages of the loaded files, in the given order.
 * Without `rasterize`, pages are copied as-is (text stays selectable) and the
 * user's rotation is added to each page's own.
 */
export async function buildPdf<P extends OutputPage>(pages: P[], options: BuildOptions<P> = {}): Promise<Uint8Array> {
  const { signal, onProgress, rasterize, sources = new Map() } = options;
  const out = await PDFDocument.create();
  let done = 0;
  const tick = () => onProgress?.(++done, pages.length);

  if (rasterize) {
    for (const page of pages) {
      signal?.throwIfAborted();
      const raster = await rasterize(page);
      const image = await out.embedJpg(raster.jpeg);
      out.addPage([raster.width, raster.height]).drawImage(image, { x: 0, y: 0, width: raster.width, height: raster.height });
      tick();
    }
  } else {
    // Copy from each source in one pass, then add the copies in output order.
    const byDoc = new Map<number, { doc: SourceDoc; at: number[] }>();
    pages.forEach((page, at) => {
      const group = byDoc.get(page.doc.id) ?? { doc: page.doc, at: [] };
      group.at.push(at);
      byDoc.set(page.doc.id, group);
    });
    const copies: PDFPage[] = new Array(pages.length);
    for (const { doc, at } of byDoc.values()) {
      signal?.throwIfAborted();
      const src = await loadSource(doc, sources);
      const copied = await out.copyPages(src, at.map((i) => pages[i].index));
      at.forEach((i, k) => (copies[i] = copied[k]));
    }
    pages.forEach((page, i) => {
      const copy = copies[i];
      const own = ((copy.getRotation().angle % 360) + 360) % 360;
      copy.setRotation(degrees((own + page.rot) % 360));
      out.addPage(copy);
      tick();
    });
  }

  signal?.throwIfAborted();
  out.setProducer(PRODUCER);
  out.setCreator(PRODUCER);
  return out.save();
}
