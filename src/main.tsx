import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./shared/theme/tokens.css";
import "./shared/theme/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./app/router";

/*
 * After an update, a page that was already open can ask for a tool's code by
 * its old file name, which the new build no longer has. Reload once to pick
 * up the new version instead of showing an error. (A tool that failed to load
 * has no files in it yet, so nothing is lost.)
 */
window.addEventListener("vite:preloadError", (event) => {
  try {
    const last = Number(sessionStorage.getItem("pocket-tools:reloaded-at") ?? 0);
    if (Date.now() - last < 10_000) return; // just tried; let the error page explain
    sessionStorage.setItem("pocket-tools:reloaded-at", String(Date.now()));
  } catch {
    return; // no storage means no loop guard, so don't risk reloading forever
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
