import { describe, expect, it } from "vitest";
import { outputName, outputType, targetSize, uniqueNames } from "./output";

describe("outputType", () => {
  it("keeps JPG, PNG and WebP when asked to keep the format", () => {
    expect(outputType("same", "image/jpeg").ext).toBe("jpg");
    expect(outputType("same", "image/webp").ext).toBe("webp");
    expect(outputType("same", "image/png").ext).toBe("png");
  });

  it("writes formats browsers can't encode as PNG", () => {
    expect(outputType("same", "image/gif").mime).toBe("image/png");
    expect(outputType("same", "image/bmp").mime).toBe("image/png");
  });

  it("uses the chosen format otherwise", () => {
    expect(outputType("webp", "image/png").mime).toBe("image/webp");
  });
});

describe("targetSize", () => {
  it("keeps the size by default", () => {
    expect(targetSize(4000, 3000, { mode: "none" })).toEqual({ width: 4000, height: 3000 });
  });

  it("fits the longest side", () => {
    expect(targetSize(4000, 3000, { mode: "fit", max: 1600 })).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3000, 4000, { mode: "fit", max: 1600 })).toEqual({ width: 1200, height: 1600 });
  });

  it("scales by percent", () => {
    expect(targetSize(4000, 3000, { mode: "percent", percent: 25 })).toEqual({ width: 1000, height: 750 });
  });

  it("never enlarges and never reaches zero", () => {
    expect(targetSize(800, 600, { mode: "fit", max: 1600 })).toEqual({ width: 800, height: 600 });
    expect(targetSize(800, 600, { mode: "percent", percent: 300 })).toEqual({ width: 800, height: 600 });
    expect(targetSize(10, 1, { mode: "percent", percent: 1 })).toEqual({ width: 1, height: 1 });
  });
});

describe("file names", () => {
  it("swaps the extension", () => {
    expect(outputName("Holiday.HEIC.png", "jpg")).toBe("Holiday.HEIC.jpg");
    expect(outputName("scan", "png")).toBe("scan.png");
  });

  it("numbers duplicates", () => {
    expect(uniqueNames(["a.jpg", "b.jpg", "A.jpg", "a.jpg"])).toEqual(["a.jpg", "b.jpg", "A (2).jpg", "a (3).jpg"]);
  });
});
