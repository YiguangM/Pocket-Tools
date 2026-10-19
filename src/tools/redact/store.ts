import { useSyncExternalStore } from "react";
import { detectFaces, detectPlates, detectText } from "./detect";
import type { Box } from "./geometry";

export type Kind = "face" | "plate" | "text" | "manual";
export type Region = { id: number; kind: Kind; x: number; y: number; w: number; h: number; on: boolean };
export type RedactItem = {
  id: number;
  file: File;
  bitmap: ImageBitmap;
  /** "faces" etc. while that detector runs. */
  status: "waiting" | "faces" | "plates" | "text" | "ready" | "failed";
  progress: number;
  regions: Region[];
};

/* Extra room around each find, as a share of its size: faces get hair and ears, plates their frame. */
const PAD: Record<Kind, number> = { face: 0.12, plate: 0.06, text: 0, manual: 0 };
/** Faces and plates are hidden by default; text is shown for you to choose, since photos often have harmless text. */
const ON_BY_DEFAULT: Record<Kind, boolean> = { face: true, plate: true, text: false, manual: true };

let items: RedactItem[] = [];
let lastId = 0;
let busy = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (id: number, change: (item: RedactItem) => Partial<RedactItem>) => {
  items = items.map((i) => (i.id === id ? { ...i, ...change(i) } : i));
  emit();
};

function toRegions(boxes: Box[], kind: Kind, width: number, height: number): Region[] {
  return boxes.map((b) => {
    const pad = PAD[kind] * Math.max(b.x2 - b.x1, b.y2 - b.y1);
    const x = Math.max(0, b.x1 - pad);
    const y = Math.max(0, b.y1 - pad);
    return { id: ++lastId, kind, x, y, w: Math.min(width, b.x2 + pad) - x, h: Math.min(height, b.y2 + pad) - y, on: ON_BY_DEFAULT[kind] };
  });
}

/* Works through new photos one at a time: faces first, then plates, then text, showing finds as they come. */
async function pump() {
  if (busy) return;
  busy = true;
  for (let item = items.find((i) => i.status === "waiting"); item; item = items.find((i) => i.status === "waiting")) {
    const { id, bitmap } = item;
    const alive = () => items.some((i) => i.id === id);
    const add = (boxes: Box[], kind: Kind) => alive() && patch(id, (i) => ({ regions: [...i.regions, ...toRegions(boxes, kind, bitmap.width, bitmap.height)] }));
    try {
      patch(id, () => ({ status: "faces", progress: 0 }));
      add(await detectFaces(bitmap, (p) => alive() && patch(id, () => ({ progress: p }))), "face");
      if (!alive()) continue;
      patch(id, () => ({ status: "plates" }));
      add(await detectPlates(bitmap), "plate");
      if (!alive()) continue;
      patch(id, () => ({ status: "text" }));
      add(await detectText(bitmap), "text");
      if (alive()) patch(id, () => ({ status: "ready" }));
    } catch {
      if (alive()) patch(id, () => ({ status: "failed" }));
    }
  }
  busy = false;
}

/* Kept outside React so detection carries on while you visit other tools. Memory only. */
export const redactions = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => items,

  async add(files: File[]): Promise<string[]> {
    const problems: string[] = [];
    for (const file of files) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        items = [...items, { id: ++lastId, file, bitmap, status: "waiting", progress: 0, regions: [] }];
        emit();
      } catch {
        problems.push(`${file.name} couldn't be opened.`);
      }
    }
    void pump();
    return problems;
  },
  remove(id: number) {
    items.find((i) => i.id === id)?.bitmap.close();
    items = items.filter((i) => i.id !== id);
    emit();
  },
  toggle(id: number, regionId: number) {
    patch(id, (i) => ({ regions: i.regions.map((r) => (r.id === regionId ? { ...r, on: !r.on } : r)) }));
  },
  setKind(id: number, kind: Kind, on: boolean) {
    patch(id, (i) => ({ regions: i.regions.map((r) => (r.kind === kind ? { ...r, on } : r)) }));
  },
  addArea(id: number, area: { x: number; y: number; w: number; h: number }) {
    patch(id, (i) => ({ regions: [...i.regions, { id: ++lastId, kind: "manual", ...area, on: true }] }));
  },
  moveArea(id: number, regionId: number, area: { x: number; y: number; w: number; h: number }) {
    patch(id, (i) => ({ regions: i.regions.map((r) => (r.id === regionId ? { ...r, ...area } : r)) }));
  },
  removeArea(id: number, regionId: number) {
    patch(id, (i) => ({ regions: i.regions.filter((r) => r.id !== regionId) }));
  },
};

export function useRedactions(): RedactItem[] {
  return useSyncExternalStore(redactions.subscribe, redactions.get);
}
