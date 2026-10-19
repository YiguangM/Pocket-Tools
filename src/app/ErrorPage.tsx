import { useDocumentTitle } from "../shared/lib/useDocumentTitle";
import "./app.css";

/** Shown when a route fails to render, e.g. a tool's code couldn't be loaded. */
export function ErrorPage() {
  useDocumentTitle("Something went wrong");
  return (
    <main className="wrap">
      <section className="hero">
        <a className="back" href={import.meta.env.BASE_URL}>
          All tools
        </a>
        <h1>That didn't load</h1>
        <p className="tag">Something broke while opening this page. Reloading usually fixes it.</p>
        <button className="btn primary" type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    </main>
  );
}
