/*
 * Runs Real-ESRGAN off the main thread so the page stays responsive during
 * long upscales. Receives one padded tile at a time, returns it 4x larger.
 */
import { Tensor, type InferenceSession } from "onnxruntime-web/wasm";
import { createSession } from "../../shared/lib/onnx";
import modelUrl from "./realesr-general-x4v3.onnx?url";

export type TileRequest = { id: number; data: Float32Array; width: number; height: number };
export type TileResponse = { id: number; data?: Float32Array; error?: string };

// The worker's global, typed by hand: the "webworker" type library clashes with the DOM one this project uses.
const scope = self as unknown as {
  onmessage: (event: MessageEvent<TileRequest>) => void;
  postMessage: (message: TileResponse, transfer?: Transferable[]) => void;
};
let session: Promise<InferenceSession> | null = null;

scope.onmessage = async ({ data: { id, data, width, height } }: MessageEvent<TileRequest>) => {
  try {
    session ??= createSession(modelUrl);
    const model = await session;
    const input = new Tensor("float32", data, [1, 3, height, width]);
    const { output } = await model.run({ input });
    const result = (output.data as Float32Array).slice(); // own buffer, so it can be transferred
    input.dispose();
    output.dispose();
    scope.postMessage({ id, data: result } satisfies TileResponse, [result.buffer]);
  } catch (e) {
    session = null;
    scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies TileResponse);
  }
};
