import { Tensor, type InferenceSession } from "onnxruntime-web/wasm";
import { createSession } from "../../shared/lib/onnx";
import { MODEL_SIZE, normalizeMask, toInput } from "./tensor";
import modelUrl from "./u2netp.onnx?url";

/* U²-Net (u2netp) from backgroundremover, converted to ONNX. */
let session: Promise<InferenceSession> | null = null;

/** Loads the model once (cached by the service worker after the first use). */
export function loadModel(): Promise<InferenceSession> {
  session ??= createSession(modelUrl).catch((e) => {
    session = null; // let a later attempt retry
    throw e;
  });
  return session;
}

/** RGBA pixels of a MODEL_SIZE² image -> 0..1 foreground mask of the same size. */
export async function predictMask(rgba: Uint8ClampedArray): Promise<Float32Array> {
  const model = await loadModel();
  const input = new Tensor("float32", toInput(rgba), [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const { mask } = await model.run({ input });
  const result = normalizeMask(mask.data as Float32Array);
  input.dispose();
  mask.dispose();
  return result;
}
