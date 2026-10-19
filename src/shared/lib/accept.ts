/**
 * Tests a file against an <input accept> string such as ".pdf,application/pdf"
 * or "image/*". Drag and drop skips the browser's own accept filter, so drop
 * targets need this.
 */
export function matchesAccept(file: { name: string; type: string }, accept: string): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}
