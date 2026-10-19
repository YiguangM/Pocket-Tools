/**
 * The app-level Content-Security-Policy. Every tool runs under it.
 *
 * Built pages carry it as a <meta> tag. Serve the same string as a
 * Content-Security-Policy response header too: a meta tag can't cover
 * workers or set frame-ancestors.
 *
 * connect-src is 'self' only so pdf.js can read its bundled CMaps and fonts
 * and the background remover can load its bundled model.
 * 'wasm-unsafe-eval' lets the page compile WebAssembly (ONNX Runtime); it does
 * not allow JavaScript eval. No directive allows any other origin.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");
