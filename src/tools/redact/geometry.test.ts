import { describe, expect, it } from "vitest";
import { cutByTile, decodePlates, decodeYunet, dropContained, iou, letterbox, mapBack, nms, plausiblePlate, rotatedSize, textBoxes, tiles, toTensor, unrotateBox, type Box } from "./geometry";

const box = (x1: number, y1: number, x2: number, y2: number, score = 1): Box => ({ x1, y1, x2, y2, score });

describe("box helpers", () => {
  it("measures overlap", () => {
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(1);
    expect(iou(box(0, 0, 10, 10), box(5, 0, 15, 10))).toBeCloseTo(1 / 3);
    expect(iou(box(0, 0, 1, 1), box(5, 5, 6, 6))).toBe(0);
  });

  it("keeps the best of overlapping boxes", () => {
    expect(nms([box(0, 0, 10, 10, 0.6), box(1, 1, 11, 11, 0.9), box(50, 50, 60, 60, 0.7)], 0.3).map((b) => b.score)).toEqual([0.9, 0.7]);
  });

  it("drops boxes inside bigger ones", () => {
    expect(dropContained([box(0, 0, 10, 5), box(0, 0, 10, 20), box(30, 0, 40, 10)])).toEqual([box(0, 0, 10, 20), box(30, 0, 40, 10)]);
  });
});

describe("placement", () => {
  it("letterboxes into a square, top-left or centred", () => {
    expect(letterbox(1280, 640, 640, false)).toEqual({ scale: 0.5, w: 640, h: 320, dx: 0, dy: 0 });
    expect(letterbox(1280, 640, 640, true)).toMatchObject({ dx: 0, dy: 160 });
  });

  it("maps model boxes back to the source", () => {
    expect(mapBack(box(0, 160, 64, 192), { scale: 0.5, dx: 0, dy: 160 }, 100, 0)).toEqual(box(100, 0, 228, 64));
  });

  it("orders and normalizes channels", () => {
    const rgba = Uint8ClampedArray.from([10, 20, 30, 255]);
    expect(Array.from(toTensor(rgba, { bgr: true, scale: 1 }))).toEqual([30, 20, 10]);
    expect(Array.from(toTensor(rgba, { bgr: false, scale: 1 / 10, mean: [1, 0, 0], std: [1, 2, 1] }))).toEqual([0, 1, 3]);
  });
});

describe("decoders", () => {
  it("decodes a YuNet face at stride 32", () => {
    const zeros = (n: number) => new Float32Array(n);
    const out: Record<string, Float32Array> = {};
    for (const s of [8, 16, 32]) {
      const n = (640 / s) ** 2;
      out[`cls_${s}`] = zeros(n);
      out[`obj_${s}`] = zeros(n);
      out[`bbox_${s}`] = zeros(n * 4);
    }
    const i = 2 * 20 + 3; // row 2, col 3 on the 20-wide stride-32 grid
    out.cls_32[i] = 0.81;
    out.obj_32[i] = 1;
    out.bbox_32.set([0.5, 0.5, Math.log(2), Math.log(3)], i * 4);
    const [face] = decodeYunet(out, 0.5);
    expect(face.score).toBeCloseTo(0.9);
    [face.x1, face.y1, face.x2, face.y2].forEach((v, k) => expect(v).toBeCloseTo([80, 32, 144, 128][k], 4));
  });

  it("reads plate rows above the threshold", () => {
    const rows = Float32Array.from([0, 10, 20, 110, 60, 0, 0.9, 0, 1, 1, 2, 2, 0, 0.2]);
    expect(decodePlates(rows, 0.4)).toEqual([box(10, 20, 110, 60, expect.closeTo(0.9) as unknown as number)]);
  });

  it("rejects plate finds that can't be plates", () => {
    expect(plausiblePlate(box(100, 200, 240, 250), 500, 619)).toBe(true); // a real plate
    expect(plausiblePlate(box(0, 0, 600, 900), 600, 900)).toBe(false); // the whole photo
    expect(plausiblePlate(box(10, 10, 30, 90), 600, 900)).toBe(false); // tall and thin
  });

  it("turns a text blob into a padded box and ignores weak ones", () => {
    const [w, h] = [20, 10];
    const prob = new Float32Array(w * h);
    for (let y = 2; y < 5; y++) for (let x = 2; x < 12; x++) prob[y * w + x] = 0.9; // a 10x3 word
    for (let x = 15; x < 19; x++) prob[8 * w + x] = 0.35; // faint noise
    const found = textBoxes(prob, w, h);
    expect(found).toHaveLength(1);
    const grow = (10 * 3 * 2) / (2 * 13);
    expect(found[0]).toMatchObject({ x1: 2 - grow, y1: 2 - grow, x2: 12 + grow, y2: 5 + grow });
  });
});

describe("rotation", () => {
  it("sizes the turned canvas", () => {
    expect(rotatedSize(400, 200, 90)).toEqual({ w: 200, h: 400 });
    expect(rotatedSize(100, 100, 45)).toEqual({ w: 141, h: 141 });
  });

  it("maps a box found in a quarter-turned copy back to the original", () => {
    // 400x200 image turned 90° clockwise -> 200x400. Original pixel (x, y) lands at (200 - y, x).
    // A face at x 300..340, y 20..60 in the original sits at x 140..180, y 300..340 in the copy.
    const back = unrotateBox(box(140, 300, 180, 340, 0.8), 90, 400, 200);
    [back.x1, back.y1, back.x2, back.y2].forEach((v, k) => expect(v).toBeCloseTo([300, 20, 340, 60][k], 6));
    expect(back.score).toBe(0.8);
  });

  it("undoes a half turn", () => {
    const back = unrotateBox(box(0, 0, 50, 20), 180, 400, 200);
    [back.x1, back.y1, back.x2, back.y2].forEach((v, k) => expect(v).toBeCloseTo([350, 180, 400, 200][k], 6));
  });

  it("grows boxes from diagonal turns and keeps them inside the image", () => {
    const back = unrotateBox(box(0, 0, 141, 141), 45, 100, 100);
    expect(back).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 100 });
  });
});

describe("tiles", () => {
  it("covers the image with overlapping tiles", () => {
    const t = tiles(700, 300, 320, 64);
    expect(t.map((r) => [r.x, r.y, r.x2, r.y2])).toEqual([[0, 0, 320, 300], [256, 0, 576, 300], [512, 0, 700, 300]]);
  });

  it("spots faces cut by an inner tile edge only", () => {
    const t = { x: 256, y: 0, x2: 576, y2: 300 };
    expect(cutByTile(box(257, 10, 300, 50), t, 700, 300)).toBe(true); // touches the left (inner) edge
    expect(cutByTile(box(300, 0, 340, 40), t, 700, 300)).toBe(false); // top edge is the image edge
    expect(cutByTile(box(300, 100, 340, 140), t, 700, 300)).toBe(false);
  });
});
