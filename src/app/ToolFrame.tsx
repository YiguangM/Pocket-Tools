import { Suspense } from "react";
import { Link } from "react-router";
import { useDocumentTitle } from "../shared/lib/useDocumentTitle";
import { IconArrowLeft, IconLock } from "../shared/ui/icons";
import { Reveal } from "../shared/ui/Reveal";
import type { ToolDefinition } from "../tools/types";

/** The page frame every tool gets: a way back home, the tool's title, and the privacy promise. */
export function ToolFrame({ tool }: { tool: ToolDefinition }) {
  useDocumentTitle(tool.name);
  const Tool = tool.component;
  return (
    <main className="wrap">
      <section className="hero">
        <Link className="back" to="/">
          <IconArrowLeft size={14} />
          All tools
        </Link>
        <Reveal as="h1" split="chars" stagger={0.04} key={tool.id}>
          {tool.name}
        </Reveal>
        <p className="tag">{tool.description} Everything happens in this tab, so your files are never sent anywhere.</p>
        <div className="proof">
          <span className="pill">
            <IconLock size={14} />0 bytes uploaded
          </span>
        </div>
      </section>
      {/* Tool CSS is scoped to this wrapper (see tests/tool-css-scope.test.ts), so it can't leak into the shell or other tools. */}
      <div className="tool-root" data-tool={tool.id}>
        <Suspense fallback={<p className="loading">Loading {tool.name}…</p>}>
          <Tool />
        </Suspense>
      </div>
    </main>
  );
}
