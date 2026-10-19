import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { imagesToPdf, MARGIN, placeImage } from "./combine";

// The smallest valid JPEG: 1x1 px, grey.
const TINY_JPEG = Uint8Array.from(
  atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="),
  (c) => c.charCodeAt(0),
);

describe("placeImage", () => {
  it("sizes the page to the image at 96 dpi", () => {
    expect(placeImage(800, 600, "fit")).toEqual({ page: [600, 450], x: 0, y: 0, width: 600, height: 450 });
  });

  it("fits big images inside the margins and centers them", () => {
    const p = placeImage(4000, 3000, "a4"); // wide, so landscape
    expect(p.page).toEqual([841.89, 595.28]);
    expect(p.height).toBeCloseTo(595.28 - 2 * MARGIN);
    expect(p.x).toBeCloseTo((841.89 - p.width) / 2);
    expect(p.y).toBeCloseTo(MARGIN);
  });

  it("keeps small images at natural size instead of blowing them up", () => {
    const p = placeImage(200, 300, "letter");
    expect(p.page).toEqual([612, 792]);
    expect([p.width, p.height]).toEqual([150, 225]);
  });
});

describe("imagesToPdf", () => {
  it("makes one page per image, in order", async () => {
    const bytes = await imagesToPdf(
      [
        { data: TINY_JPEG, kind: "jpeg", width: 800, height: 600 },
        { data: TINY_JPEG, kind: "jpeg", width: 300, height: 900 },
      ],
      "fit",
    );
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([[600, 450], [225, 675]]);
    expect(pdf.getProducer()).toBe("Pocket Tools");
  });
});
