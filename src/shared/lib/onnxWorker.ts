/*
 * Runs any bundled ONNX model off the main thread. Sessions are cached per
 * model URL. Talk to it through runModel() in onnxClient.ts.
 */
import { Tensor, type InferenceSession } from "onnxruntime-web/wasm";
import { createSession } from "./onnx";

export type Feeds = Record<string, { data: Float32Array; dims: number[] }>;
export type ModelRequest = { id: number; model: string; feeds: Feeds };
export type ModelResponse = { id: number; outputs?: Feeds; error?: string };

// The worker's global, typed by hand: the "webworker" type library clashes with the DOM one this project uses.
const scope = self as unknown as {
  onmessage: (event: MessageEvent<ModelRequest>) => void;
  postMessage: (message: ModelResponse, transfer?: Transferable[]) => void;
};
const sessions = new Map<string, Promise<InferenceSession>>();

scope.onmessage = async ({ data: { id, model, feeds } }) => {
  try {
    let session = sessions.get(model);
    if (!session) sessions.set(model, (session = createSession(model)));
    const inputs = Object.fromEntries(Object.entries(feeds).map(([name, f]) => [name, new Tensor("float32", f.data, f.dims)]));
    const results = await (await session).run(inputs);
    const outputs: Feeds = {};
    for (const [name, tensor] of Object.entries(results)) {
      outputs[name] = { data: (tensor.data as Float32Array).slice(), dims: [...tensor.dims] }; // own buffers, so they can be transferred
      tensor.dispose();
    }
    Object.values(inputs).forEach((t) => t.dispose());
    scope.postMessage({ id, outputs }, Object.values(outputs).map((o) => o.data.buffer));
  } catch (e) {
    sessions.delete(model);
    scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
