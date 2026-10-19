import { describe, expect, it } from "vitest";
import { matchesAccept } from "./accept";

describe("matchesAccept", () => {
  const pdf = ".pdf,application/pdf";

  it("matches by extension, ignoring case", () => {
    expect(matchesAccept({ name: "Lease.PDF", type: "" }, pdf)).toBe(true);
  });

  it("matches by MIME type when the name has no extension", () => {
    expect(matchesAccept({ name: "scan", type: "application/pdf" }, pdf)).toBe(true);
  });

  it("rejects other files", () => {
    expect(matchesAccept({ name: "photo.jpg", type: "image/jpeg" }, pdf)).toBe(false);
  });

  it("supports wildcard types", () => {
    expect(matchesAccept({ name: "photo.jpg", type: "image/jpeg" }, "image/*")).toBe(true);
    expect(matchesAccept({ name: "doc.pdf", type: "application/pdf" }, "image/*")).toBe(false);
  });
});
