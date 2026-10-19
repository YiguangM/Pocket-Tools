/**
 * Privacy guard: no code in src/ may reach the network. Files stay in memory.
 *
 * Each source file is parsed (not grepped), so comments and prose don't
 * count but every real reference does: calls, `new`, `window.fetch`,
 * `globalThis["fetch"]`, aliases like `const f = fetch`, and the same for
 * XMLHttpRequest, WebSocket, EventSource and navigator.sendBeacon.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const BANNED = new Set(["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "sendBeacon"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

type Finding = { name: string; line: number };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return CODE.test(entry.name) ? [path] : [];
  });
}

/** Walks the ESTree AST and reports every identifier, property or string key with a banned name. */
export function findNetworkUse(filename: string, code: string): Finding[] {
  const { program, errors } = parseSync(filename, code);
  if (errors.length) throw new Error(`${filename} did not parse: ${errors[0].message}`);
  const lineOf = (offset: number) => code.slice(0, offset).split("\n").length;
  const found: Finding[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as Record<string, unknown> & { type?: string; start?: number };
    const name =
      n.type === "Identifier" || n.type === "JSXIdentifier"
        ? n.name
        : n.type === "Literal" && typeof n.value === "string"
          ? n.value
          : n.type === "TemplateElement"
            ? (n.value as { cooked?: string }).cooked
            : undefined;
    if (typeof name === "string" && BANNED.has(name)) found.push({ name, line: lineOf(n.start ?? 0) });
    for (const value of Object.values(n)) visit(value);
  };
  visit(program);
  return found;
}

describe("no network access in src/", () => {
  const files = sourceFiles(SRC);

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("catches every banned form (self-check)", () => {
    const sample = [
      "// fetch() in a comment is fine",
      'const ok = "fetch me a coffee";',
      "fetch('/x');",
      "window.fetch('/x');",
      'globalThis["fetch"]("/x");',
      "const f = fetch;",
      "new XMLHttpRequest();",
      "new WebSocket('wss://x');",
      "new EventSource('/x');",
      "navigator.sendBeacon('/x');",
      "window[`fetch`]('/x');",
    ].join("\n");
    expect(findNetworkUse("sample.ts", sample).map((f) => f.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it.each(files.map((f) => [relative(SRC, f).replaceAll("\\", "/"), f]))("%s makes no network calls", (_, file) => {
    expect(findNetworkUse(file, readFileSync(file, "utf8"))).toEqual([]);
  });
});
