export type RangeResult = { idx: number[]; err?: undefined } | { idx?: undefined; err: string };

/**
 * Parses a page list such as "1-3, 7, 10-end" against `total` pages and
 * returns zero-based indices in the order written. Ranges may run backwards
 * ("5-2") and pages may repeat.
 */
export function parseRange(input: string, total: number): RangeResult {
  const s = input.trim().replace(/\s*-\s*/g, "-");
  if (!s) return { err: "Type pages, like 1-3, 7, 10-end." };
  const idx: number[] = [];
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+|end)(?:-(\d+|end))?$/i.exec(part);
    if (!m) return { err: `"${part}" is not a page or range.` };
    const toNumber = (t: string) => (/^end$/i.test(t) ? total : parseInt(t, 10));
    const a = toNumber(m[1]);
    const b = m[2] === undefined ? a : toNumber(m[2]);
    const bad = [a, b].find((n) => n < 1 || n > total);
    if (bad !== undefined) return { err: total ? `Page ${bad} is outside 1-${total}.` : "There are no pages yet." };
    const step = a <= b ? 1 : -1;
    for (let n = a; n !== b + step; n += step) idx.push(n - 1);
  }
  return { idx };
}
