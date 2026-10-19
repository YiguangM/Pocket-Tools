import { describe, expect, it } from "vitest";
import { tools } from "./registry";

describe("tool registry", () => {
  it("has at least one tool", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it("gives every tool the full definition", () => {
    for (const tool of tools) {
      expect(tool.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(tool.name.trim()).not.toBe("");
      expect(tool.description.trim()).not.toBe("");
      expect(tool.icon).toBeTypeOf("function");
      expect(tool.component).toBeTruthy();
    }
  });

  it("uses unique ids and unique absolute routes that don't shadow home", () => {
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.route)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.route).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/);
    }
  });
});
