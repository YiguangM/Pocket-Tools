export type OutFormat = "same" | "jpeg" | "png" | "webp";
export type Resize = { mode: "none" } | { mode: "fit"; max: number } | { mode: "percent"; percent: number };

const TYPES = {
  jpeg: { mime: "image/jpeg", ext: "jpg", lossy: true },
  png: { mime: "image/png", ext: "png", lossy: false },
  webp: { mime: "image/webp", ext: "webp", lossy: true },
} as const;
export type OutputType = (typeof TYPES)[keyof typeof TYPES];

/** The encoding to write. "Same as original" keeps JPG, PNG and WebP; anything else becomes PNG. */
export function outputType(format: OutFormat, inputMime: string): OutputType {
  if (format !== "same") return TYPES[format];
  if (inputMime === "image/jpeg") return TYPES.jpeg;
  if (inputMime === "image/webp") return TYPES.webp;
  return TYPES.png;
}

/** Output pixel size. Never enlarges; always at least 1x1. */
export function targetSize(width: number, height: number, resize: Resize): { width: number; height: number } {
  let scale = 1;
  if (resize.mode === "fit" && resize.max > 0) scale = Math.min(1, resize.max / Math.max(width, height));
  if (resize.mode === "percent" && resize.percent > 0) scale = Math.min(1, resize.percent / 100);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** "Holiday.HEIC" + "jpg" -> "Holiday.jpg". */
export function outputName(name: string, ext: string): string {
  const stem = name.replace(/\.[^.]+$/, "") || "image";
  return `${stem}.${ext}`;
}

/** Makes names unique for a ZIP: "a.jpg", "a (2).jpg", ... */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? name : name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
  });
}
