import { describe, expect, it } from "vitest";
import { baseName, chunk, imageFileName, imagesZipName, partFileName, pdfFileName, zipFileName } from "./output";

describe("output names", () => {
  it("uses the file's own name when one file is loaded", () => {
    expect(baseName(["Lease agreement.PDF"])).toBe("Lease agreement");
    expect(pdfFileName("all", "Lease agreement", 1)).toBe("Lease agreement-edited.pdf");
  });

  it("calls a merge of several files 'merged'", () => {
    const base = baseName(["a.pdf", "b.pdf"]);
    expect(base).toBe("merged");
    expect(pdfFileName("all", base, 2)).toBe("merged.pdf");
  });

  it("names extracts and splits", () => {
    expect(pdfFileName("selected", "x", 1)).toBe("x-selected.pdf");
    expect(pdfFileName("range", "x", 3)).toBe("x-pages.pdf");
    expect(partFileName("x", 3)).toBe("x-part-03.pdf");
    expect(zipFileName("x")).toBe("x-split.zip");
  });

  it("numbers images so they sort in page order", () => {
    expect(imageFileName("x", 3, 8, "png")).toBe("x-page-03.png");
    expect(imageFileName("x", 7, 120, "jpg")).toBe("x-page-007.jpg");
    expect(imageFileName("x", 1, 1, "png")).toBe("x-page-01.png");
    expect(imagesZipName("x")).toBe("x-images.zip");
  });
});

describe("chunk", () => {
  it("splits into runs with a shorter tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("treats sizes below 1 or not a number as 1", () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunk([1, 2], NaN)).toEqual([[1], [2]]);
  });
});
