# Pocket Tools: developer guide

A growing set of small, private utilities that run entirely in the browser. Files are read into memory, worked on in the tab, and saved back to disk. Nothing is uploaded. After the first visit the whole app works offline.

Tools so far: the **PDF toolbox** (`/pdf`), the **Image converter** (`/images`), **Face and plate blur** (`/redact`), the **Background remover** (`/background`) and the **Image upscaler** (`/upscale`), each described below.

## Commands

```sh
npm install
npm run dev        # dev server (no CSP, hot reload)
npm test           # unit tests + the no-network guard
npm run typecheck
npm run build      # type-check, then build to dist/ with CSP and service worker
npm run preview    # serve dist/ locally
```

## Desktop shortcut (Windows)

`npm run shortcut` puts a **Pocket Tools** shortcut on the Desktop, in the Start menu and in this folder. Opening it runs `launcher/launch.ps1`, which:

1. rebuilds `dist/` if anything in `src/`, `public/` or the config changed since the last build (a notification shows while it builds),
2. serves `dist/` on `http://localhost:4818` with a hidden local server,
3. opens the app in its own Chrome window (Edge if Chrome isn't installed), using a separate profile in `%LOCALAPPDATA%\PocketTools\browser`,
4. stops the server when that window closes.

Opening the shortcut again while the app is open just brings up the window. Run `npm run shortcut` again if you move the project folder.

## Layout

```
src/
  main.tsx              fonts, theme, router
  app/                  the shell: routes, home screen, tool page frame, 404, error page
  tools/
    types.ts            ToolDefinition: { id, name, description, icon, route, component }
    registry.ts         the list of tools; the shell reads nothing else
    pdf/                the PDF toolbox (see below)
    images/             the Image converter (see below)
    background/         the Background remover (see below)
    upscale/            the Image upscaler (see below)
    redact/             Face and plate blur (see below)
  shared/
    theme/              design tokens (light + dark) and base styles
    ui/                 DropZone, FileChips, Step, ChoiceCard, OutputPanel + useJob, ProgressBar, PreviewModal, Status, Toast, Reveal, icons
    lib/                downloadFile, formatBytes, matchesAccept, useDocumentTitle, onnx + onnxWorker/onnxClient (AI model runtime)
tests/
  no-network.test.ts    fails if any code in src/ uses fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon
  tool-css-scope.test.ts  fails if a tool's CSS can leak outside its [data-tool] wrapper
launcher/               Windows shortcut: launch.ps1, create-shortcut.ps1, pocket-tools.ico
csp.ts                  the app-wide Content-Security-Policy
vite.config.ts          React, pdf.js asset bundling, CSP injection, service worker
```

The shell only lists the registry on `/` and renders each tool's `component` at its `route`, inside a shared frame (back link, title, privacy line). Tools load lazily, so opening the home screen doesn't download pdf.js.

## Adding a tool

1. Create `src/tools/<name>/index.ts` exporting a `ToolDefinition`. Use `React.lazy` for `component`.
2. Add it to `src/tools/registry.ts`.
3. Build the UI from `src/shared` (drop zone, file chips, steps, progress, preview modal, toasts, `downloadFile`) rather than copying the PDF tool. Keep only tool-specific code in the tool's folder.
4. Scope the tool's CSS. The app is one page, so a tool's stylesheet stays loaded after you leave it. Put every rule inside a `[data-tool="<id>"] { ... }` block (`ToolFrame` renders that wrapper) and prefix keyframes with `<id>-`. Name the folder after the id.
5. Follow the privacy rule: no network, files stay in memory. If a library needs data files, bundle them and serve them from the app's origin, as `pdfjsAssets()` in `vite.config.ts` does for pdf.js.

`src/tools/registry.test.ts` checks that ids and routes are unique and well formed. `tests/tool-css-scope.test.ts` fails on any tool CSS rule outside its scope.

## Privacy, enforced three ways

- **No network code.** `tests/no-network.test.ts` parses every file in `src/` and fails on any reference to `fetch`, `XMLHttpRequest`, `WebSocket`, `WebSocketStream`, `EventSource` or `sendBeacon`, including `window.fetch` and `globalThis["fetch"]`. It parses instead of grepping, so comments don't trigger it.
- **Content-Security-Policy.** `csp.ts` is injected into built pages as a `<meta>` tag. Only the app's own origin is allowed for scripts, styles, fonts, workers and connections (`connect-src 'self'` exists only so pdf.js can read its bundled CMaps and fonts). The dev server runs without it because hot reload needs inline scripts and a websocket.
- **Nothing from a CDN.** Fonts come from `@fontsource`, and pdf.js's worker, CMaps, standard fonts, wasm decoders and ICC profiles are copied into `dist/pdfjs/` at build time.

## Deploying

`dist/` is static. Two things to set up on the host:

- **SPA fallback.** Serve `index.html` for unknown paths, so a first visit straight to `/pdf` works. (After the first visit, the service worker handles deep links, online or offline.)
- **CSP as a response header.** Send the string from `csp.ts` as a `Content-Security-Policy` header too. A `<meta>` policy doesn't cover web workers (pdf.js renders in one) and can't set `frame-ancestors`. Add `frame-ancestors 'none'` in the header version.

The app assumes it is served from `/`. To host it under a sub-path, set `base` in `vite.config.ts`. The router and the pdf.js asset URLs follow `import.meta.env.BASE_URL`.

## PDF toolbox

Port of the Pocket PDF prototype, with the same scope:

- **Add:** pick or drop PDFs anywhere on the page. Password-protected and damaged files are reported, non-PDFs are skipped. Two generated example files are one click away in the empty state.
- **Arrange:** one grid of pages from every file. Select, rotate, delete, move earlier or later, drag to reorder, reverse, undo (30 steps), clear. Keyboard: arrows move focus, Shift+arrows reorder, Space selects, Enter previews, R / Shift+R rotate, Delete removes, Ctrl/Cmd+Z undoes.
- **Preview:** full-screen page view with previous, next and rotate.
- **Save as PDF:** all pages, selected pages, a page range (`1-3, 7, 10-end`, backwards ranges and repeats allowed), or split every N pages into a ZIP. Optional Compress redraws each page as a JPEG at high, medium or low quality. Output metadata names Pocket Tools as producer and creator.
- **Save as images:** the same page choices (except split), one PNG or JPG per page at 72, 150 or 300 dpi, rotations applied. One page downloads as a single image; several come as a ZIP named in page order (`report-page-01.png`, ...).

Without Compress, pages are copied as they are (pdf-lib), so text stays selectable. Encrypted files can't be copied that way; the tool says so and suggests Compress, which renders through pdf.js instead.

Loaded files persist while you move around the app, and are dropped when the tab closes or reloads.

Code map: `model.ts` (state and undo, pure), `range.ts`, `output.ts` (file names), `build.ts` (pdf-lib assembly, pure), `exporters.ts` (PDF, split and image exports), `samples.ts`, `pdfjs.ts` (rendering), `thumbnails.ts` (render queue), `session.ts` (in-memory session and cleanup), and the components `PdfTool`, `PageGrid`, `Toolbar`, `SavePanel`, `PageViewer`.

## Image converter

`/images`. Converts, shrinks and resizes images, and shows and removes the data hidden in them.

- **Add:** JPG, PNG, WebP, GIF, BMP or AVIF (whatever the browser can decode; HEIC only works in Safari).
- **Review:** each image as a card with its size and the hidden data found: location (flagged in red), camera, date taken, software, XMP, IPTC, comments, PNG text. The preview shows the actual values, such as GPS coordinates. Read by `metadata.ts` from JPEG, PNG and WebP.
- **Convert and save:** keep each format, switch to JPG, PNG or WebP, or combine everything into **one PDF** (one page per image, in card order; A4, US Letter or pages sized to each image); quality for lossy formats; resize to fit a longest side or by percent (never enlarges). Every output is redrawn, so all hidden data is gone and photos are turned upright first. One image downloads as is; several come as `converted-images.zip`, with duplicate names numbered.

Code map: `metadata.ts`, `output.ts` and `combine.ts` (pure or pdf-lib only, tested), `convert.ts` (decode and re-encode), and the components `ImagesTool`, `ConvertPanel`, `ImagePreview`.

## Background remover

`/background`. Cuts the subject (a person, pet or product) out of photos, entirely in the tab.

- **Model:** U²-Net small (`u2netp`), taken from [nadermx/backgroundremover](https://github.com/nadermx/backgroundremover) (`models/u2netp.pth`, MIT; model weights Apache-2.0, see [`public/licenses/`](../public/licenses/)). It was converted once to ONNX (`src/tools/background/u2netp.onnx`, 4.6 MB, first output only; matches PyTorch within 1e-4) and runs with ONNX Runtime Web's WebAssembly backend. The Python project itself is not part of this app.
- **Pipeline** (same as backgroundremover's): resize to 320×320, divide by the brightest value, ImageNet mean/std (`tensor.ts`, tested); min-max the output into a mask, scale it to full size and apply it as transparency (`cutout.ts`).
- **Save:** transparent PNG, or JPG on white or a chosen colour. Several images come as `backgrounds-removed.zip`.
- **Size:** the runtime (14 MB) and model (4.6 MB) are not in the up-front offline download; the service worker caches them the first time the tool is used. The CSP allows `'wasm-unsafe-eval'` so the page can compile WebAssembly.

## Image upscaler

`/upscale`. Makes images 2× or 4× bigger with AI, in the tab.

- **Model:** Real-ESRGAN's compact general model `realesr-general-x4v3` (BSD-3, see `public/licenses/real-esrgan-LICENSE.txt`), the model family Upscayl is built on. Upscayl itself (an AGPL-3.0 desktop app with a native GPU program) is not part of this app. The official weights were converted once to ONNX (`src/tools/upscale/realesr-general-x4v3.onnx`, 4.9 MB, any input size; matches PyTorch within 1e-5).
- **How it runs:** in a web worker (`worker.ts`), so the page stays responsive, on ONNX Runtime's WebAssembly backend (set up once in `src/shared/lib/onnx.ts`, shared with the background remover). Images are processed in 128 px tiles with 10 px of real neighbouring pixels around each (`tiles.ts`, tested), so no seams show. The model works at 4×; for 2× each tile is scaled down as it's placed. Transparency is carried over.
- **Speed and limits:** processor only, about a minute for a 1000×1000 photo. Outputs are capped at 16 million pixels (a browser canvas limit), so a large photo may only fit at 2×; the tool says so.
- **Save:** PNG or JPG, `name-4x.png`; several images come as `upscaled-images.zip`. Results are kept, so saving again with the same settings doesn't redo the work.

## Face and plate blur

`/redact`. Finds faces, license plates and text in photos, shows each find as a square, and lets you choose what to blur, pixelate or black out before sharing. Built as a private alternative to uploading photos to online blur sites; inspired by [mbpictures/pixelateme](https://github.com/mbpictures/pixelateme) (a Python CLI with no license file, so none of its code is used).

- **Models** (all ONNX, run in a shared background worker, `src/shared/lib/onnxWorker.ts`; licenses in [`public/licenses/`](../public/licenses/)):
  - Faces: YuNet 2023mar from [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo) (MIT, 230 KB). One whole-photo pass; copies turned in 45° steps for tilted or upside-down heads (mapped back onto the photo); overlapping 320 px tiles viewed at 2x for small faces, skipping faces cut by a tile edge; overlaps and nested boxes merged. Found 443 faces in a 2048×1150 crowd photo, and all 7 tilted faces in a looking-up group shot.
  - License plates: YOLOv9-tiny 384 end-to-end from [ankandrew/open-image-models](https://github.com/ankandrew/open-image-models) (MIT, 7.8 MB).
  - Text: PP-OCRv4 detection from [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) via [RapidOCR](https://github.com/RapidAI/RapidOCR) (Apache-2.0, 4.7 MB).
  - Decoding (`geometry.ts`, tested) follows each project's reference code and was checked against it on their sample photos.
- **Editing:** faces and plates start hidden, text starts shown (photos often have harmless text). Click a square to switch it, drag it to move, drag its corner to resize, × to remove (any kind); the kind buttons switch all of one kind; drag on the photo to add your own area. Keyboard: arrows move, Shift+arrows resize, Delete removes. The preview shows the effect live.
- **Saving:** blur, pixelate or black box with a strength setting; this photo or all of them (ZIP). Blur and pixelate shrink each area to a few cells, so the detail is gone, not just smudged. The photo is redrawn, so GPS and other metadata are removed as well.
- **Size:** the three models (12.7 MB) are cached on first use, like the other AI tools.
