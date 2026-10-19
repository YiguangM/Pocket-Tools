export type SaveMode = "all" | "selected" | "range" | "split";

/** The stem for output names: the file's own name when one file is loaded, otherwise "merged". */
export function baseName(docNames: string[]): string {
  return docNames.length === 1 ? docNames[0].replace(/\.pdf$/i, "") : "merged";
}

export function pdfFileName(mode: Exclude<SaveMode, "split">, base: string, docCount: number): string {
  if (mode === "selected") return `${base}-selected.pdf`;
  if (mode === "range") return `${base}-pages.pdf`;
  return docCount === 1 ? `${base}-edited.pdf` : `${base}.pdf`;
}

export function partFileName(base: string, part: number): string {
  return `${base}-part-${String(part).padStart(2, "0")}.pdf`;
}

export function zipFileName(base: string): string {
  return `${base}-split.zip`;
}

/** "report-page-07.png"; numbers are padded so the files sort in page order. */
export function imageFileName(base: string, position: number, total: number, ext: string): string {
  return `${base}-page-${String(position).padStart(Math.max(2, String(total).length), "0")}.${ext}`;
}

export function imagesZipName(base: string): string {
  return `${base}-images.zip`;
}

/** Splits a list into runs of `size` (the last one may be shorter). */
export function chunk<T>(list: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size) || 1);
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
