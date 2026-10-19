import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PreviewModal } from "../../shared/ui/PreviewModal";
import type { LoadedDoc, PageRef } from "./model";
import { renderPage } from "./pdfjs";

type PageViewerProps = {
  /** The page on show, or null when closed. */
  uid: number | null;
  pages: PageRef[];
  docs: Map<number, LoadedDoc>;
  onShow: (uid: number | null) => void;
  onRotate: (uid: number) => void;
};

/** A large, sharp preview of one page, drawn to fit the screen. */
export function PageViewer({ uid, pages, docs, onShow, onRotate }: PageViewerProps) {
  const index = uid === null ? -1 : pages.findIndex((p) => p.uid === uid);
  const page = index >= 0 ? pages[index] : undefined;
  const doc = page ? docs.get(page.docId) : undefined;
  const hostRef = useRef<HTMLDivElement>(null);
  const [resized, setResized] = useState(0);

  // The page can vanish while open (Ctrl+Z); close instead of showing nothing.
  useEffect(() => {
    if (uid !== null && !page) onShow(null);
  }, [uid, page, onShow]);

  const open = page !== undefined;
  useEffect(() => {
    if (!open) return;
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setResized((n) => n + 1), 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    const host = hostRef.current;
    const stage = host?.parentElement;
    if (!host || !stage) return;
    if (!page || !doc) {
      host.replaceChildren();
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const pdfPage = await doc.pdf.getPage(page.index + 1);
        if (controller.signal.aborted) return;
        const unit = pdfPage.getViewport({ scale: 1, rotation: (pdfPage.rotate + page.rot) % 360 });
        const fit = Math.min(Math.max(120, stage.clientWidth - 32) / unit.width, Math.max(120, stage.clientHeight - 32) / unit.height);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const canvas = await renderPage(pdfPage, fit * dpr, page.rot, controller.signal);
        if (controller.signal.aborted) return;
        canvas.style.width = `${Math.floor(unit.width * fit)}px`;
        canvas.style.height = `${Math.floor(unit.height * fit)}px`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Page ${index + 1} preview`);
        host.replaceChildren(canvas);
      } catch {
        if (!controller.signal.aborted) host.textContent = "Couldn't draw this page.";
      }
    })();
    return () => controller.abort();
    // Redraw only when what's on screen changes, not when e.g. selection does.
  }, [page?.uid, page?.index, page?.rot, index, doc, resized]);

  const prev = () => index > 0 && onShow(pages[index - 1].uid);
  const next = () => index >= 0 && index < pages.length - 1 && onShow(pages[index + 1].uid);
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  return (
    <PreviewModal
      open={open}
      label="Page preview"
      title={page && doc ? `Page ${index + 1} of ${pages.length} · ${doc.name} · p${page.index + 1}` : ""}
      onClose={() => onShow(null)}
      onKeyDown={onKeyDown}
      actions={
        <>
          <button className="btn small" type="button" disabled={index <= 0} onClick={prev}>
            Previous
          </button>
          <button className="btn small" type="button" disabled={index < 0 || index >= pages.length - 1} onClick={next}>
            Next
          </button>
          <button className="btn small" type="button" disabled={!page} onClick={() => page && onRotate(page.uid)}>
            Rotate
          </button>
        </>
      }
    >
      <div className="viewer-page" ref={hostRef} />
    </PreviewModal>
  );
}
