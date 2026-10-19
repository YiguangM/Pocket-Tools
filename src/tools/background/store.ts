import { useSyncExternalStore } from "react";
import { removeBackground, type Cutout } from "./cutout";

export type CutoutItem = {
  id: number;
  file: File;
  /** blob: URL of the original. */
  url: string;
  status: "waiting" | "working" | "done" | "failed";
  cutout?: Cutout;
};
type Snapshot = { items: CutoutItem[]; modelLoading: boolean };

/**
 * Holds the images and works through them one at a time, outside React, so
 * processing carries on while you visit other tools. Memory only; closing
 * the tab clears it.
 */
class CutoutStore {
  private snapshot: Snapshot = { items: [], modelLoading: false };
  private listeners = new Set<() => void>();
  private busy = false;
  private lastId = 0;
  private everRan = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  get = () => this.snapshot;

  private set(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }
  private update(id: number, patch: Partial<CutoutItem>) {
    this.set({ items: this.snapshot.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  add(files: File[]) {
    const added = files.map((file): CutoutItem => ({ id: ++this.lastId, file, url: URL.createObjectURL(file), status: "waiting" }));
    this.set({ items: [...this.snapshot.items, ...added] });
    void this.pump();
  }

  remove(ids: number[]) {
    for (const item of this.snapshot.items) {
      if (!ids.includes(item.id)) continue;
      URL.revokeObjectURL(item.url);
      if (item.cutout) URL.revokeObjectURL(item.cutout.url);
    }
    this.set({ items: this.snapshot.items.filter((i) => !ids.includes(i.id)) });
  }

  retry(id: number) {
    this.update(id, { status: "waiting" });
    void this.pump();
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    for (let next = this.nextWaiting(); next; next = this.nextWaiting()) {
      this.update(next.id, { status: "working" });
      if (!this.everRan) this.set({ modelLoading: true }); // the first run also loads the model
      try {
        const cutout = await removeBackground(next.file);
        if (this.snapshot.items.some((i) => i.id === next!.id)) this.update(next.id, { status: "done", cutout });
        else URL.revokeObjectURL(cutout.url); // removed while working
        this.everRan = true;
      } catch {
        this.update(next.id, { status: "failed" });
      }
      if (this.snapshot.modelLoading) this.set({ modelLoading: false });
    }
    this.busy = false;
  }

  private nextWaiting() {
    return this.snapshot.items.find((i) => i.status === "waiting");
  }
}

export const cutouts = new CutoutStore();

export function useCutouts(): Snapshot {
  return useSyncExternalStore(cutouts.subscribe, cutouts.get);
}
