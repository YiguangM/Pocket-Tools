/**
 * Tool styles must not leak. The app is one page, so a tool's CSS stays
 * loaded after you leave it; an unscoped `.tools {}` once restyled the home
 * screen. Every rule in src/tools/<id>/**\/*.css must sit inside a
 * `[data-tool="<id>"]` block (ToolFrame renders that wrapper), and keyframes
 * need an "<id>-" prefix because animation names are global. Styles meant
 * for everyone belong in src/shared or src/app.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tools } from "../src/tools/registry";

const TOOLS = fileURLToPath(new URL("../src/tools/", import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

/** The selector or at-rule before each top-level block (or statement), comments removed. */
export function topLevelPreludes(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const preludes: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{") {
      if (depth++ === 0) preludes.push(src.slice(start, i).trim());
    } else if (c === "}") {
      if (--depth === 0) start = i + 1;
    } else if (c === ";" && depth === 0) {
      preludes.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  return preludes;
}

export function unscopedRules(css: string, id: string): string[] {
  const scope = new RegExp(`^\\[data-tool=(["'])${id}\\1\\]$`);
  const keyframes = new RegExp(`^@keyframes\\s+${id}-[\\w-]+$`);
  return topLevelPreludes(css).filter((p) => !scope.test(p) && !keyframes.test(p));
}

const toolDirs = readdirSync(TOOLS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

describe("tool CSS is scoped to its tool", () => {
  it("names each tool folder after a registered tool id", () => {
    const ids = tools.map((t) => t.id);
    for (const dir of toolDirs) expect(ids).toContain(dir);
  });

  it("catches unscoped rules (self-check)", () => {
    const sample = `
      /* .comment { } is fine */
      [data-tool="pdf"] { .tools { display: flex; } @media (hover: none) { .zoom { opacity: 1; } } }
      [data-tool='pdf'] { .x { content: "}"; } }
      @keyframes pdf-pulse { from { opacity: 0; } }
      .tools { display: flex; }
      [data-tool="other"] { .y { color: red; } }
      @keyframes pulse { to { opacity: 1; } }
      @import "x.css";
    `;
    expect(unscopedRules(sample, "pdf")).toEqual([".tools", '[data-tool="other"]', "@keyframes pulse", '@import "x.css"']);
  });

  const files = toolDirs.flatMap((id) => cssFiles(join(TOOLS, id)).map((file) => [relative(TOOLS, file).replaceAll("\\", "/"), id, file]));

  it.each(files)("%s only styles inside its tool", (_, id, file) => {
    expect(unscopedRules(readFileSync(file, "utf8"), id)).toEqual([]);
  });
});
