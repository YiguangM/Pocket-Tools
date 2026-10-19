import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPdf, EncryptedSourceError, PRODUCER, type OutputPage, type SourceCache, type SourceDoc } from "./build";
import { makeSample, SAMPLES } from "./samples";

// The smallest valid JPEG: 1x1 px, grey.
const TINY_JPEG = Uint8Array.from(
  atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="),
  (c) => c.charCodeAt(0),
);

let lease: SourceDoc; // 3 portrait pages
let receipts: SourceDoc; // portrait, then landscape

beforeAll(async () => {
  lease = { id: 1, name: SAMPLES[0].name, bytes: await makeSample(SAMPLES[0]) };
  receipts = { id: 2, name: SAMPLES[1].name, bytes: await makeSample(SAMPLES[1]) };
});

const page = (doc: SourceDoc, index: number, rot = 0): OutputPage => ({ doc, index, rot });
const sizes = (pdf: PDFDocument) => pdf.getPages().map((p) => [p.getWidth(), p.getHeight()]);

describe("buildPdf, copying pages", () => {
  it("merges pages from several files in the requested order", async () => {
    const bytes = await buildPdf([page(receipts, 1), page(lease, 2), page(receipts, 0), page(lease, 0)]);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(4);
    expect(sizes(out)).toEqual([[842, 595], [595, 842], [595, 842], [595, 842]]);
  });

  it("adds the user's rotation to each page", async () => {
    const bytes = await buildPdf([page(lease, 0, 90), page(lease, 1, 270), page(lease, 2)]);
    const out = await PDFDocument.load(bytes);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([90, 270, 0]);
  });

  it("can include the same page twice", async () => {
    const bytes = await buildPdf([page(lease, 0), page(lease, 0, 180)]);
    const out = await PDFDocument.load(bytes);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 180]);
  });

  it("stamps the producer and creator", async () => {
    // updateMetadata: false, or pdf-lib overwrites the producer while reading the file back.
    const out = await PDFDocument.load(await buildPdf([page(lease, 0)]), { updateMetadata: false });
    expect(out.getProducer()).toBe(PRODUCER);
    expect(out.getCreator()).toBe(PRODUCER);
  });

  it("reports progress for every page", async () => {
    const calls: [number, number][] = [];
    await buildPdf([page(lease, 0), page(lease, 1), page(receipts, 0)], { onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("parses each source once when builds share a cache", async () => {
    const sources: SourceCache = new Map();
    await buildPdf([page(lease, 0)], { sources });
    const first = sources.get(lease.id);
    await buildPdf([page(lease, 1)], { sources });
    expect(sources.get(lease.id)).toBe(first);
  });

  it("refuses encrypted sources instead of writing unreadable pages", async () => {
    const plain = await PDFDocument.load(lease.bytes);
    const text = new TextDecoder("latin1").decode(await plain.save({ useObjectStreams: false }));
    const locked = text.replace(/trailer\s*<</, "trailer\n<<\n/Encrypt 1 0 R");
    const bytes = Uint8Array.from(locked, (c) => c.charCodeAt(0));
    await expect(buildPdf([page({ id: 9, name: "locked.pdf", bytes }, 0)])).rejects.toBeInstanceOf(EncryptedSourceError);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildPdf([page(lease, 0)], { signal: controller.signal })).rejects.toThrow();
  });
});

describe("buildPdf, compressing", () => {
  it("draws each page as an image at the rasterized page size", async () => {
    const seen: OutputPage[] = [];
    const bytes = await buildPdf([page(lease, 0), page(receipts, 1, 90)], {
      rasterize: async (p) => {
        seen.push(p);
        return { jpeg: TINY_JPEG, width: 300 + seen.length, height: 400 };
      },
    });
    const out = await PDFDocument.load(bytes);
    expect(seen.map((p) => [p.doc.id, p.index, p.rot])).toEqual([[1, 0, 0], [2, 1, 90]]);
    expect(sizes(out)).toEqual([[301, 400], [302, 400]]);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0]);
  });
});
