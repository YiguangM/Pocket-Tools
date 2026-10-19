import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { IconX } from "../../shared/ui/icons";
import { hideArea, type Effect, type Rect } from "./effects";
import { redactions, type Kind, type RedactItem, type Region } from "./store";

const PREVIEW_MAX = 1600;
const KIND_LABEL: Record<Kind, string> = { face: "Face", plate: "License plate", text: "Text", manual: "Your area" };
/** Pointer travel (screen px) before a press on a square counts as a drag rather than a click. */
const DRAG_START = 4;

type Gesture =
  | { type: "draw"; x0: number; y0: number; rect: Rect }
  | { type: "move" | "resize"; regionId: number; px: number; py: number; sx: number; sy: number; start: Rect; rect: Rect; moved: boolean };

/**
 * The photo with a square on every find.
 * Click a square to hide or show it; drag it to move it; drag its corner to
 * resize it; × removes it. Drag on empty photo to add an area. Keyboard:
 * arrows move, Shift+arrows resize, Delete removes, Space/Enter toggles.
 */
export function Editor({ item, effect, strength }: { item: RedactItem; effect: Effect; strength: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const { bitmap } = item;
  const W = bitmap.width;
  const H = bitmap.height;

  // While a square is being dragged, preview it where it is going.
  const live = gesture && gesture.type !== "draw" ? gesture : null;
  const regions: Region[] = live ? item.regions.map((r) => (r.id === live.regionId ? { ...r, ...live.rect } : r)) : item.regions;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const scale = Math.min(1, PREVIEW_MAX / Math.max(W, H));
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    for (const r of regions) if (r.on) hideArea(ctx, bitmap, scale, r, effect, strength);
  }, [bitmap, regions, effect, strength, W, H]);

  const toImage = (e: PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: Math.min(W, Math.max(0, ((e.clientX - rect.left) / rect.width) * W)), y: Math.min(H, Math.max(0, ((e.clientY - rect.top) / rect.height) * H)) };
  };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const minSide = Math.max(4, Math.min(W, H) * 0.01);
  /** Keeps a square inside the photo and at least a few pixels big. */
  const fit = (r: Rect): Rect => {
    const w = Math.min(W, Math.max(minSide, r.w));
    const h = Math.min(H, Math.max(minSide, r.h));
    return { x: Math.min(W - w, Math.max(0, r.x)), y: Math.min(H - h, Math.max(0, r.y)), w, h };
  };

  function startOnSquare(e: PointerEvent, region: Region, type: "move" | "resize") {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    const start = { x: region.x, y: region.y, w: region.w, h: region.h };
    setGesture({ type, regionId: region.id, px: p.x, py: p.y, sx: e.clientX, sy: e.clientY, start, rect: start, moved: type === "resize" });
  }

  function onMove(e: PointerEvent) {
    if (!gesture) return;
    const p = toImage(e);
    if (gesture.type === "draw") {
      const { x0, y0 } = gesture;
      setGesture({ ...gesture, rect: { x: Math.min(x0, p.x), y: Math.min(y0, p.y), w: Math.abs(p.x - x0), h: Math.abs(p.y - y0) } });
      return;
    }
    const moved = gesture.moved || Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > DRAG_START;
    if (!moved) return;
    const [dx, dy] = [p.x - gesture.px, p.y - gesture.py];
    const s = gesture.start;
    const rect = gesture.type === "move" ? fit({ ...s, x: s.x + dx, y: s.y + dy }) : fit({ ...s, w: s.w + dx, h: s.h + dy });
    setGesture({ ...gesture, rect, moved });
  }

  function onUp() {
    if (!gesture) return;
    if (gesture.type === "draw") {
      const r = gesture.rect;
      if (r.w > W * 0.01 && r.h > H * 0.01) redactions.addArea(item.id, r);
    } else if (gesture.moved) {
      redactions.moveArea(item.id, gesture.regionId, gesture.rect);
    } else {
      redactions.toggle(item.id, gesture.regionId); // a press without a drag is a click
    }
    setGesture(null);
  }

  function onSquareKey(e: KeyboardEvent, region: Region) {
    const step = Math.max(1, Math.round(Math.min(W, H) * (e.altKey ? 0.002 : 0.01)));
    const arrows: Partial<Record<string, [number, number]>> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = arrows[e.key];
    if (d) {
      e.preventDefault();
      const r = { x: region.x, y: region.y, w: region.w, h: region.h };
      redactions.moveArea(item.id, region.id, fit(e.shiftKey ? { ...r, w: r.w + d[0], h: r.h + d[1] } : { ...r, x: r.x + d[0], y: r.y + d[1] }));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      redactions.removeArea(item.id, region.id);
      overlayRef.current?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      redactions.toggle(item.id, region.id);
    }
  }

  const draft = gesture?.type === "draw" ? gesture.rect : null;

  return (
    <div className="editor">
      <div className="stage">
        <canvas ref={canvasRef} role="img" aria-label={`Preview of ${item.file.name} with the chosen areas hidden`} />
        <div
          ref={overlayRef}
          className={"overlay" + (live?.moved ? " dragging" : "")}
          tabIndex={-1}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget || e.button !== 0) return;
            const p = toImage(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            setGesture({ type: "draw", x0: p.x, y0: p.y, rect: { x: p.x, y: p.y, w: 0, h: 0 } });
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setGesture(null)}
        >
          {regions.map((r) => (
            <div
              key={r.id}
              className={`region ${r.kind}${r.on ? " on" : ""}${live?.regionId === r.id ? " active" : ""}`}
              style={{ left: pct(r.x, W), top: pct(r.y, H), width: pct(r.w, W), height: pct(r.h, H) }}
            >
              <button
                type="button"
                className="toggle"
                aria-pressed={r.on}
                aria-label={`${KIND_LABEL[r.kind]}: ${r.on ? "hidden" : "shown"}. Space switches; arrows move; Shift+arrows resize; Delete removes.`}
                onPointerDown={(e) => startOnSquare(e, r, "move")} // move/up bubble to the overlay, which finishes every gesture
                onClick={(e) => e.preventDefault() /* pointer presses are handled in onUp; keyboard in onKeyDown */}
                onKeyDown={(e) => onSquareKey(e, r)}
                style={{ cursor: live?.moved ? "grabbing" : "grab" }}
              />
              <span
                className="handle"
                aria-hidden="true"
                onPointerDown={(e) => startOnSquare(e, r, "resize")}
              />
              <button type="button" className="drop" aria-label={`Remove this ${KIND_LABEL[r.kind].toLowerCase()} square`} onClick={() => redactions.removeArea(item.id, r.id)}>
                <IconX size={11} />
              </button>
            </div>
          ))}
          {draft && <div className="draft" style={{ left: pct(draft.x, W), top: pct(draft.y, H), width: pct(draft.w, W), height: pct(draft.h, H) }} />}
        </div>
      </div>
      <p className="editor-help">
        Click a square to hide or show it · drag it to move · drag its corner to resize · × removes it · drag on the photo to add one
      </p>
    </div>
  );
}
