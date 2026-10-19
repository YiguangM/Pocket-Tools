import { Link } from "react-router";
import { useDocumentTitle } from "../shared/lib/useDocumentTitle";
import { IconArrowLeft } from "../shared/ui/icons";

export function NotFound() {
  useDocumentTitle("Not found");
  return (
    <main className="wrap">
      <section className="hero">
        <Link className="back" to="/">
          <IconArrowLeft size={14} />
          All tools
        </Link>
        <h1>Not here</h1>
        <p className="tag">There's no tool at this address. Pick one from the list.</p>
      </section>
    </main>
  );
}
