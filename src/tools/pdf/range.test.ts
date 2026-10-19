import { describe, expect, it } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("reads single pages, ranges and 'end'", () => {
    expect(parseRange("1-3, 7, 9-end", 10)).toEqual({ idx: [0, 1, 2, 6, 8, 9] });
  });

  it("accepts spaces around dashes and other separators", () => {
    expect(parseRange(" 1 - 2 ;4 5", 5)).toEqual({ idx: [0, 1, 3, 4] });
  });

  it("runs backwards ranges in reverse", () => {
    expect(parseRange("end-3", 5)).toEqual({ idx: [4, 3, 2] });
  });

  it("keeps repeats", () => {
    expect(parseRange("1, 1", 2)).toEqual({ idx: [0, 0] });
  });

  it("is case-insensitive about 'end'", () => {
    expect(parseRange("END", 4)).toEqual({ idx: [3] });
  });

  it("explains empty input", () => {
    expect(parseRange("  ", 4).err).toMatch(/Type pages/);
  });

  it("rejects things that aren't pages", () => {
    expect(parseRange("1-3, x", 4).err).toBe('"x" is not a page or range.');
    expect(parseRange("1--3", 4).err).toBe('"1--3" is not a page or range.');
  });

  it("names the page that is out of bounds", () => {
    expect(parseRange("2-9", 4).err).toBe("Page 9 is outside 1-4.");
    expect(parseRange("0-2", 4).err).toBe("Page 0 is outside 1-4.");
  });
});
