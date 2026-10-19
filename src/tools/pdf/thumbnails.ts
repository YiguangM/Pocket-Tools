import { useSyncExternalStore } from "react";
import type { LoadedDoc } from "./model";
import { renderThumbnail } from "./pdfjs";

export type Thumbnail = { url?: string; failed?: boolean };

const key = (docId: number, index: number) => `${docId}:${index}`;

/**
 * Renders page thumbnails one at a time, in request order, and keeps them as
 * blob: URLs. One thumbnail per source page: rotation is shown with CSS, so
 * rotating never re-renders.
 */
class ThumbnailStore {
  private entries = new Map<string, Thumbnail>();
  private queue: { doc: LoadedDoc; index: number }[] = [];
  private busy = false;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(docId: number, index: number): Thumbnail | undefined {
    return this.entries.get(key(docId, index));
  }

  requestAll(doc: LoadedDoc) {
    for (let index = 0; index < doc.pageCount; index++) {
      const k = key(doc.id, index);
      if (this.entries.has(k)) continue;
      this.entries.set(k, {});
      this.queue.push({ doc, index });
    }
    void this.pump();
  }

  /** Drops a doc's thumbnails and frees their memory. */
  forget(docId: number) {
    const prefix = `${docId}:`;
    for (const [k, entry] of this.entries) {
      if (!k.startsWith(prefix)) continue;
      if (entry.url) URL.revokeObjectURL(entry.url);
      this.entries.delete(k);
    }
    this.queue = this.queue.filter((job) => job.doc.id !== docId);
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const { doc, index } = this.queue.shift()!;
      const k = key(doc.id, index);
      let next: Thumbnail;
      try {
        next = { url: URL.createObjectURL(await renderThumbnail(doc.pdf, index)) };
      } catch {
        next = { failed: true };
      }
      if (this.entries.has(k)) this.entries.set(k, next);
      else if (next.url) URL.revokeObjectURL(next.url); // forgotten while rendering
      this.listeners.forEach((l) => l());
    }
    this.busy = false;
  }
}

export const thumbnails = new ThumbnailStore();

/** Re-renders only the tile whose thumbnail changed. */
export function useThumbnail(docId: number, index: number): Thumbnail | undefined {
  return useSyncExternalStore(thumbnails.subscribe, () => thumbnails.get(docId, index));
}
