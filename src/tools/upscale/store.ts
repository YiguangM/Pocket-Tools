import { useSyncExternalStore } from "react";
import type { Upscaled } from "./upscale";

export type UpscaleItem = {
  id: number;
  file: File;
  /** blob: URL of the original. */
  url: string;
  width: number;
  height: number;
  /** The last result, and the settings ("4:image/png") it was made with. */
  result?: Upscaled & { key: string };
};

/* Kept outside React so a long upscale carries on while you visit other tools. Memory only. */
let items: UpscaleItem[] = [];
let lastId = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const upscales = {
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
        items = [...items, { id: ++lastId, file, url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height }];
        bitmap.close();
        emit();
      } catch {
        problems.push(`${file.name} couldn't be opened.`);
      }
    }
    return problems;
  },

  setResult(id: number, result: UpscaleItem["result"]) {
    const old = items.find((i) => i.id === id);
    if (!old) return result && URL.revokeObjectURL(result.url); // removed while working
    if (old.result) URL.revokeObjectURL(old.result.url);
    items = items.map((i) => (i.id === id ? { ...i, result } : i));
    emit();
  },

  remove(ids: number[]) {
    for (const item of items) {
      if (!ids.includes(item.id)) continue;
      URL.revokeObjectURL(item.url);
      if (item.result) URL.revokeObjectURL(item.result.url);
    }
    items = items.filter((i) => !ids.includes(i.id));
    emit();
  },
};

export function useUpscales(): UpscaleItem[] {
  return useSyncExternalStore(upscales.subscribe, upscales.get);
}
