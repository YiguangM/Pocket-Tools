import { runModel } from "../../shared/lib/onnxClient";
import {
  cutByTile,
  decodePlates,
  decodeYunet,
  dropContained,
  letterbox,
  mapBack,
  nms,
  plausiblePlate,
  PLATE_SIZE,
  rotatedSize,
  textBoxes,
  tiles,
  toTensor,
  unrotateBox,
  YUNET_SIZE,
  type Box,
} from "./geometry";
import plateModel from "./yolov9t-plates.onnx?url";
import textModel from "./ppocrv4-text.onnx?url";
import faceModel from "./yunet-faces.onnx?url";

type Source = ImageBitmap | HTMLCanvasElement;

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Draws part of the source, scaled to fit, into a square model input
 * (letterboxed) and returns its pixels plus where it went. A 320 px tile
 * fills a 640 px input, which is the 2x zoom the face scan relies on.
 */
function square(src: Source, sx: number, sy: number, sw: number, sh: number, size: number, opts: { center: boolean; fill: string }) {
  const { w, h, dx, dy } = letterbox(sw, sh, size, opts.center);
  const c = canvas(size, size);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = opts.fill;
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, sw, sh, dx, dy, w, h);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  c.width = c.height = 0;
  return { pixels, placement: { scale: w / sw, dx, dy } };
}

async function yunet(pixels: Uint8ClampedArray, threshold = FACE_THRESHOLD): Promise<Box[]> {
  const out = await runModel(faceModel, { input: { data: toTensor(pixels, { bgr: true, scale: 1 }), dims: [1, 3, YUNET_SIZE, YUNET_SIZE] } });
  return decodeYunet(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.data])), threshold);
}

const FACE_THRESHOLD = 0.5;
const TURNED_THRESHOLD = 0.6; // a little stricter on turned copies, so the extra passes don't add false finds
const FACE_TILE = 320; // tiles are viewed at 2x, so small faces look big enough
const FACE_OVERLAP = 64;
const MAX_WORK_SIDE = 2560; // bigger photos are scanned at this size; faces stay findable, time stays bounded
const TURNS = [45, 90, 135, 180, 225, 270, 315]; // the face model mostly knows upright faces; tilted heads need a turned view
const TURN_SIDE = 1280; // turned copies are scanned at this size; tilted faces this matters for are rarely tiny

/** Scans copies of the photo turned in 45° steps and maps the faces found back onto the original. */
async function turnedFaces(src: Source, onTurn: () => void): Promise<Box[]> {
  const k = Math.min(1, TURN_SIDE / Math.max(src.width, src.height));
  const [w0, h0] = [src.width * k, src.height * k];
  const found: Box[] = [];
  for (const degrees of TURNS) {
    const { w, h } = rotatedSize(w0, h0, degrees);
    const turned = canvas(w, h);
    const ctx = turned.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(w / 2, h / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(src, -w0 / 2, -h0 / 2, w0, h0);
    const view = square(turned, 0, 0, w, h, YUNET_SIZE, { center: false, fill: "#000" });
    turned.width = turned.height = 0;
    for (const b of await yunet(view.pixels, TURNED_THRESHOLD)) {
      const back = unrotateBox(mapBack(b, view.placement), degrees, w0, h0);
      found.push({ x1: back.x1 / k, y1: back.y1 / k, x2: back.x2 / k, y2: back.y2 / k, score: back.score });
    }
    onTurn();
  }
  return found;
}

/**
 * Finds faces, large and tiny, upright and tilted: one pass over the whole
 * photo, overlapping tiles at 2x zoom for small faces (faces cut by a tile
 * edge are skipped; a neighbour or the whole-photo pass has them complete),
 * then turned copies for heads tilted sideways or upside down.
 */
export async function detectFaces(src: Source, onProgress: (fraction: number) => void): Promise<Box[]> {
  const work = Math.min(1, MAX_WORK_SIDE / Math.max(src.width, src.height));
  const W = src.width * work;
  const H = src.height * work;
  const whole = square(src, 0, 0, src.width, src.height, YUNET_SIZE, { center: false, fill: "#000" });
  const boxes = (await yunet(whole.pixels)).map((b) => mapBack(b, whole.placement));
  const grid = Math.max(W, H) > YUNET_SIZE / 2 ? tiles(W, H, FACE_TILE, FACE_OVERLAP) : [];
  const steps = grid.length + TURNS.length;
  let done = 0;
  boxes.push(...(await turnedFaces(src, () => onProgress(++done / steps))));
  for (const t of grid) {
    const [sx, sy, sw, sh] = [t.x / work, t.y / work, (t.x2 - t.x) / work, (t.y2 - t.y) / work];
    const part = square(src, sx, sy, sw, sh, YUNET_SIZE, { center: false, fill: "#000" });
    const tileInSource = { x: sx, y: sy, x2: sx + sw, y2: sy + sh };
    for (const b of await yunet(part.pixels)) {
      const face = mapBack(b, part.placement, sx, sy);
      if (!cutByTile(face, tileInSource, src.width, src.height, 3 / work)) boxes.push(face);
    }
    onProgress(++done / steps);
  }
  return dropContained(nms(boxes, 0.3));
}

/** Finds license plates in one centred pass. */
export async function detectPlates(src: Source): Promise<Box[]> {
  const { pixels, placement } = square(src, 0, 0, src.width, src.height, PLATE_SIZE, { center: true, fill: "rgb(114,114,114)" });
  const out = await runModel(plateModel, { images: { data: toTensor(pixels, { bgr: false, scale: 1 / 255 }), dims: [1, 3, PLATE_SIZE, PLATE_SIZE] } });
  const plates = decodePlates(Object.values(out)[0].data, 0.4).map((b) => mapBack(b, placement));
  return nms(plates.filter((b) => plausiblePlate(b, src.width, src.height)), 0.5);
}

const TEXT_MAX_SIDE = 960;

/** Finds words and lines of text. */
export async function detectText(src: Source): Promise<Box[]> {
  const r = Math.min(1, TEXT_MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.max(32, Math.round((src.width * r) / 32) * 32);
  const h = Math.max(32, Math.round((src.height * r) / 32) * 32);
  const c = canvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  c.width = c.height = 0;
  const input = toTensor(pixels, { bgr: true, scale: 1 / 255, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] });
  const out = Object.values(await runModel(textModel, { x: { data: input, dims: [1, 3, h, w] } }))[0];
  const [mh, mw] = out.dims.slice(-2);
  const sx = src.width / mw;
  const sy = src.height / mh;
  return textBoxes(out.data, mw, mh).map((b) => ({ x1: b.x1 * sx, y1: b.y1 * sy, x2: b.x2 * sx, y2: b.y2 * sy, score: b.score }));
}
