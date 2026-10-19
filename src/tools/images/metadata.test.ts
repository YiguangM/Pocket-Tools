import { describe, expect, it } from "vitest";
import { metadataLabels, readMetadata } from "./metadata";

type Entry = { tag: number; ascii?: string; long?: number; rationals?: [number, number][] };

/** Writes a little-endian TIFF (EXIF body) with IFD0 and an optional GPS IFD. */
function tiff(ifd0: Entry[], gps: Entry[] = []): Uint8Array {
  const buf = new Uint8Array(1024);
  const v = new DataView(buf.buffer);
  buf.set([0x49, 0x49]);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  let data = 0;
  const writeIfd = (at: number, entries: Entry[]) => {
    v.setUint16(at, entries.length, true);
    data = at + 2 + entries.length * 12 + 4;
    entries.forEach((e, i) => {
      const p = at + 2 + i * 12;
      v.setUint16(p, e.tag, true);
      if (e.ascii !== undefined) {
        const bytes = new TextEncoder().encode(`${e.ascii}\0`);
        v.setUint16(p + 2, 2, true);
        v.setUint32(p + 4, bytes.length, true);
        if (bytes.length <= 4) buf.set(bytes, p + 8);
        else {
          v.setUint32(p + 8, data, true);
          buf.set(bytes, data);
          data += bytes.length;
        }
      } else if (e.rationals) {
        v.setUint16(p + 2, 5, true);
        v.setUint32(p + 4, e.rationals.length, true);
        v.setUint32(p + 8, data, true);
        for (const [n, d] of e.rationals) {
          v.setUint32(data, n, true);
          v.setUint32(data + 4, d, true);
          data += 8;
        }
      } else {
        v.setUint16(p + 2, 4, true);
        v.setUint32(p + 4, 1, true);
        v.setUint32(p + 8, e.long ?? 0, true);
      }
    });
  };
  const entries = gps.length ? [...ifd0, { tag: 0x8825, long: 0 }] : ifd0;
  writeIfd(8, entries);
  if (gps.length) {
    const gpsAt = data;
    v.setUint32(8 + 2 + (entries.length - 1) * 12 + 8, gpsAt, true); // point IFD0 at the GPS IFD
    writeIfd(gpsAt, gps);
  }
  return buf.slice(0, data);
}

const exif = () =>
  tiff(
    [
      { tag: 0x010f, ascii: "Canon" },
      { tag: 0x0110, ascii: "Canon EOS R6" },
      { tag: 0x0132, ascii: "2026:06:01 14:03:22" },
    ],
    [
      { tag: 1, ascii: "N" },
      { tag: 2, rationals: [[48, 1], [51, 1], [2999, 100]] },
      { tag: 3, ascii: "W" },
      { tag: 4, rationals: [[2, 1], [17, 1], [4020, 100]] },
    ],
  );

function jpeg(...segments: [number, Uint8Array][]): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  for (const [marker, body] of segments) parts.push(0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body);
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(parts);
}
const bytes = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const u32be = (n: number) => Uint8Array.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
const u32le = (n: number) => Uint8Array.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]);
const pngChunk = (type: string, data: Uint8Array) => concat(u32be(data.length), bytes(type), data, new Uint8Array(4));

describe("readMetadata", () => {
  it("reads camera, date and GPS location from JPEG EXIF", () => {
    const meta = readMetadata(jpeg([0xe1, concat(bytes("Exif\0\0"), exif())]));
    expect(meta.camera).toBe("Canon EOS R6");
    expect(meta.taken).toBe("2026:06:01 14:03:22");
    expect(meta.location?.lat).toBeCloseTo(48.85833, 4);
    expect(meta.location?.lon).toBeCloseTo(-2.29450, 4);
  });

  it("notices XMP, IPTC and comments in JPEG", () => {
    const meta = readMetadata(
      jpeg([0xe1, bytes("http://ns.adobe.com/xap/1.0/\0<x/>")], [0xed, bytes("Photoshop 3.0\0")], [0xfe, bytes("hello")]),
    );
    expect(meta.extras).toEqual(["XMP", "IPTC", "Comment"]);
  });

  it("reads EXIF and text from PNG", () => {
    const png = concat(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("eXIf", exif()), pngChunk("tEXt", bytes("Author\0Me")), pngChunk("IEND", new Uint8Array()));
    const meta = readMetadata(png);
    expect(meta.camera).toBe("Canon EOS R6");
    expect(meta.location).toBeDefined();
    expect(meta.extras).toEqual(["Text notes"]);
  });

  it("reads EXIF from WebP", () => {
    const body = exif();
    const chunk = concat(bytes("EXIF"), u32le(body.length), body, body.length % 2 ? new Uint8Array(1) : new Uint8Array());
    const webp = concat(bytes("RIFF"), u32le(4 + chunk.length), bytes("WEBP"), chunk);
    expect(readMetadata(webp).camera).toBe("Canon EOS R6");
  });

  it("reports nothing for a clean image", () => {
    expect(readMetadata(jpeg())).toEqual({ extras: [] });
  });

  it("survives damaged metadata", () => {
    const broken = jpeg([0xe1, concat(bytes("Exif\0\0"), exif().slice(0, 30))]);
    expect(() => readMetadata(broken)).not.toThrow();
  });
});

describe("metadataLabels", () => {
  it("lists location first and flags it", () => {
    const labels = metadataLabels(readMetadata(jpeg([0xe1, concat(bytes("Exif\0\0"), exif())], [0xfe, bytes("hi")])));
    expect(labels).toEqual([{ label: "Location", warn: true }, { label: "Camera" }, { label: "Date taken" }, { label: "Comment" }]);
  });
});
