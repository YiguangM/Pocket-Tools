export type Effect = "blur" | "pixelate" | "box";
export type Rect = { x: number; y: number; w: number; h: number };

let scratch: HTMLCanvasElement | null = null;

/**
 * Hides one area of `ctx`, taking the pixels from the untouched `source`
 * (so overlapping areas don't blur twice). `scale` maps source pixels to
 * ctx pixels. Blur and pixelate both throw detail away by shrinking the
 * area to a few cells, so the original can't be recovered from the result.
 */
export function hideArea(ctx: CanvasRenderingContext2D, source: CanvasImageSource, scale: number, area: Rect, effect: Effect, strength: number) {
  const x = Math.round(area.x * scale);
  const y = Math.round(area.y * scale);
  const w = Math.max(1, Math.round(area.w * scale));
  const h = Math.max(1, Math.round(area.h * scale));
  ctx.save();
  if (effect === "box") {
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  // strength 1..10 -> 11..2 cells across the area's short side
  const cell = Math.max(2, Math.min(w, h) / (12 - Math.min(10, Math.max(1, strength))));
  const cw = Math.max(1, Math.round(w / cell));
  const ch = Math.max(1, Math.round(h / cell));
  scratch ??= document.createElement("canvas");
  scratch.width = cw;
  scratch.height = ch;
  const sctx = scratch.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(source, area.x, area.y, area.w, area.h, 0, 0, cw, ch);
  ctx.imageSmoothingEnabled = effect === "blur"; // smooth for blur, hard edges for pixelate
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, 0, 0, cw, ch, x, y, w, h);
  ctx.restore();
}
