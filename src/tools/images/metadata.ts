/**
 * Finds the hidden data a photo carries: EXIF (camera, date, GPS location),
 * XMP, IPTC, comments and PNG text. Reads JPEG, PNG and WebP; other formats
 * report nothing. Never throws: damaged data yields whatever was readable.
 */
export type PhotoMetadata = {
  location?: { lat: number; lon: number };
  camera?: string;
  taken?: string;
  software?: string;
  /** Other kinds of hidden data found, e.g. "XMP", "Comment". */
  extras: string[];
};

type Tags = Map<number, unknown>;

/** Reads one TIFF structure (the body of an EXIF block) starting at `start`. */
function readTiff(bytes: Uint8Array, start: number, meta: PhotoMetadata) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o: number) => view.getUint16(start + o, little);
  const u32 = (o: number) => view.getUint32(start + o, little);

  const readIfd = (offset: number): Tags => {
    const tags: Tags = new Map();
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      const size = n * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 1);
      const at = size <= 4 ? entry + 8 : u32(entry + 8);
      if (type === 2) {
        const text = new TextDecoder().decode(bytes.subarray(start + at, start + at + n)).replace(/\0+$/, "").trim();
        tags.set(tag, text);
      } else if (type === 5) {
        tags.set(tag, Array.from({ length: n }, (_, k) => u32(at + k * 8) / (u32(at + k * 8 + 4) || 1)));
      } else if (type === 4) {
        tags.set(tag, u32(at));
      } else if (type === 3) {
        tags.set(tag, u16(at));
      }
    }
    return tags;
  };

  const ifd0 = readIfd(u32(4));
  const text = (t: Tags, tag: number) => (typeof t.get(tag) === "string" && (t.get(tag) as string)) || undefined;
  const make = text(ifd0, 0x010f);
  const model = text(ifd0, 0x0110);
  if (make || model) meta.camera = model?.startsWith(make ?? "\0") ? model : [make, model].filter(Boolean).join(" ");
  meta.software ??= text(ifd0, 0x0131);
  meta.taken ??= text(ifd0, 0x0132);

  const exifAt = ifd0.get(0x8769);
  if (typeof exifAt === "number") {
    const exif = readIfd(exifAt);
    meta.taken = text(exif, 0x9003) ?? meta.taken;
  }

  const gpsAt = ifd0.get(0x8825);
  if (typeof gpsAt === "number") {
    const gps = readIfd(gpsAt);
    const deg = (v: unknown) => (Array.isArray(v) && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : undefined);
    const lat = deg(gps.get(2));
    const lon = deg(gps.get(4));
    if (lat !== undefined && lon !== undefined) {
      meta.location = { lat: gps.get(1) === "S" ? -lat : lat, lon: gps.get(3) === "W" ? -lon : lon };
    } else if (gps.size) {
      meta.extras.push("GPS data");
    }
  }
}

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
const add = (meta: PhotoMetadata, extra: string) => !meta.extras.includes(extra) && meta.extras.push(extra);
const exifStart = (bytes: Uint8Array, at: number) => (ascii(bytes, at, 6) === "Exif\0\0" ? at + 6 : at);

function readJpeg(bytes: Uint8Array, meta: PhotoMetadata) {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // image data starts; no more metadata
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const body = i + 4;
    if (marker === 0xe1 && ascii(bytes, body, 6) === "Exif\0\0") readTiff(bytes, body + 6, meta);
    else if (marker === 0xe1 && ascii(bytes, body, 28) === "http://ns.adobe.com/xap/1.0/") add(meta, "XMP");
    else if (marker === 0xed) add(meta, "IPTC");
    else if (marker === 0xfe) add(meta, "Comment");
    i += 2 + length;
  }
}

function readPng(bytes: Uint8Array, meta: PhotoMetadata) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = ascii(bytes, i + 4, 4);
    const body = i + 8;
    if (type === "eXIf") readTiff(bytes, exifStart(bytes, body), meta);
    else if (type === "iTXt" && ascii(bytes, body, 17) === "XML:com.adobe.xmp") add(meta, "XMP");
    else if (type === "tEXt" || type === "iTXt" || type === "zTXt") add(meta, "Text notes");
    else if (type === "IEND") break;
    i = body + length + 4; // skip data and CRC
  }
}

function readWebp(bytes: Uint8Array, meta: PhotoMetadata) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, 4);
    const length = view.getUint32(i + 4, true);
    if (type === "EXIF") readTiff(bytes, exifStart(bytes, i + 8), meta);
    else if (type === "XMP ") add(meta, "XMP");
    i += 8 + length + (length % 2); // chunks are padded to even sizes
  }
}

export function readMetadata(bytes: Uint8Array): PhotoMetadata {
  const meta: PhotoMetadata = { extras: [] };
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) readJpeg(bytes, meta);
    else if (ascii(bytes, 1, 3) === "PNG") readPng(bytes, meta);
    else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") readWebp(bytes, meta);
  } catch {
    // Damaged metadata: keep what was read so far.
  }
  return meta;
}

/** Short labels for the card, most sensitive first. */
export function metadataLabels(meta: PhotoMetadata): { label: string; warn?: boolean }[] {
  const labels: { label: string; warn?: boolean }[] = [];
  if (meta.location || meta.extras.includes("GPS data")) labels.push({ label: "Location", warn: true });
  if (meta.camera) labels.push({ label: "Camera" });
  if (meta.taken) labels.push({ label: "Date taken" });
  if (meta.software) labels.push({ label: "Software" });
  for (const extra of meta.extras) if (extra !== "GPS data") labels.push({ label: extra });
  return labels;
}
