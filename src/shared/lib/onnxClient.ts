import type { Feeds, ModelRequest, ModelResponse } from "./onnxWorker";

let worker: Worker | null = null;
let lastId = 0;
const pending = new Map<number, { resolve: (outputs: Feeds) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./onnxWorker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<ModelResponse>) => {
    const job = pending.get(data.id);
    pending.delete(data.id);
    if (data.outputs) job?.resolve(data.outputs);
    else job?.reject(new Error(data.error ?? "The AI model failed."));
  };
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error("The AI model stopped unexpectedly."));
    pending.clear();
    worker = null;
  };
  return worker;
}

/**
 * Runs a bundled ONNX model (its `?url` import) in a background worker and
 * returns its outputs. The input buffers are handed over to the worker.
 */
export function runModel(model: string, feeds: Feeds): Promise<Feeds> {
  const id = ++lastId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, model, feeds } satisfies ModelRequest, Object.values(feeds).map((f) => f.data.buffer));
  });
}
