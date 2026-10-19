import { env, InferenceSession } from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

/*
 * ONNX Runtime (WebAssembly) set up once for every tool that runs an AI
 * model. The runtime and the models are served by this app itself, so
 * nothing is downloaded from elsewhere and no image leaves the device.
 * Works in the page and in web workers.
 */
env.wasm.wasmPaths = { wasm: wasmUrl };
env.wasm.numThreads = 1; // threads need cross-origin isolation, which a plain static host doesn't give
env.wasm.proxy = false;

/** Loads a bundled .onnx model (pass its `?url` import). */
export function createSession(modelUrl: string): Promise<InferenceSession> {
  return InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
}
