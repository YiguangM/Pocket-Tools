import { useEffect, useMemo, useState } from "react";
import { formatBytes, plural } from "../../shared/lib/format";
import { DropZone } from "../../shared/ui/DropZone";
import { FileChips } from "../../shared/ui/FileChips";
import { Step } from "../../shared/ui/Step";
import { useToast } from "../../shared/ui/Toast";
import type { LoadedDoc } from "./model";
import { PageGrid } from "./PageGrid";
import { PageViewer } from "./PageViewer";
import { isPasswordError } from "./pdfjs";
import { makeSample, SAMPLES } from "./samples";
import { SavePanel } from "./SavePanel";
import { addDocs, openDoc, usePdfSession } from "./session";
import { Toolbar } from "./Toolbar";
import "./pdf.css";

/** Text fields where Ctrl+Z should undo typing, not page edits. */
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]';

export default function PdfTool() {
  const [state, dispatch] = usePdfSession();
  const { docs, pages, history } = state;
  const toast = useToast();
  const [viewing, setViewing] = useState<number | null>(null);
  const [makingExamples, setMakingExamples] = useState(false);

  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const docNames = useMemo(() => new Map(docs.map((d) => [d.id, d.name])), [docs]);
  const selected = useMemo(() => pages.filter((p) => p.sel).map((p) => p.uid), [pages]);
  const totalBytes = docs.reduce((sum, d) => sum + d.bytes.length, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      if (document.activeElement?.matches(TYPING)) return;
      e.preventDefault();
      dispatch({ type: "undo" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dispatch]);

  async function addFiles(files: File[], rejected: File[]) {
    const problems: string[] = [];
    const opened: LoadedDoc[] = [];
    for (const file of files) {
      try {
        opened.push(await openDoc(file.name, new Uint8Array(await file.arrayBuffer())));
      } catch (e) {
        problems.push(isPasswordError(e) ? `${file.name} is password protected.` : `${file.name} couldn't be read.`);
      }
    }
    if (rejected.length) problems.push(rejected.length === 1 ? `${rejected[0].name} isn't a PDF.` : `${rejected.length} of those files aren't PDFs.`);
    if (opened.length) {
      dispatch(addDocs(opened));
      toast(`Added ${plural(opened.length, "file")}.`);
    }
    if (problems.length) toast(problems.join(" "), "error");
  }

  async function addExamples() {
    setMakingExamples(true);
    try {
      const opened = await Promise.all(SAMPLES.map(async (spec) => openDoc(spec.name, await makeSample(spec), true)));
      dispatch(addDocs(opened));
    } catch {
      toast("Couldn't create the example files.", "error");
    } finally {
      setMakingExamples(false);
    }
  }

  return (
    <>
      <Step id="pdf-add" number="01" label="Add" title="Add your files">
        <DropZone accept=".pdf,application/pdf" buttonLabel="Add PDFs" wholePage onFiles={addFiles}>
          Drop PDF files anywhere on this page. Pages from every file land in one grid, in the order you drop them.
        </DropZone>
        <FileChips
          items={docs.map((d) => ({ id: d.id, name: d.name, detail: `${d.pageCount} p · ${formatBytes(d.bytes.length)}`, badge: d.example ? "example" : undefined }))}
          onRemove={(id) => dispatch({ type: "removeDoc", docId: Number(id) })}
        />
      </Step>

      <Step
        id="pdf-arrange"
        number="02"
        label="Arrange"
        title="Arrange the pages"
        aside={
          <p className="keys">
            Keyboard: <kbd>&larr;</kbd>
            <kbd>&rarr;</kbd>
            <kbd>&uarr;</kbd>
            <kbd>&darr;</kbd> move &middot; <kbd>Space</kbd> select &middot; <kbd>Enter</kbd> preview &middot; <kbd>R</kbd> rotate &middot; <kbd>Shift</kbd>+arrows
            reorder &middot; <kbd>Del</kbd> remove &middot; <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
          </p>
        }
      >
        <Toolbar pageCount={pages.length} selected={selected} canUndo={history.length > 0} canClear={docs.length > 0 || pages.length > 0} dispatch={dispatch} />
        <div className="count" aria-live="polite">
          {pages.length
            ? `${plural(pages.length, "page")} from ${plural(docs.length, "file")} · ${formatBytes(totalBytes)} · ${selected.length} selected`
            : ""}
        </div>
        <PageGrid
          pages={pages}
          docNames={docNames}
          dispatch={dispatch}
          onPreview={setViewing}
          empty={
            <div className="empty">
              <b>No pages yet</b>
              <span>Add a PDF or drop one anywhere on the page.{history.length ? " Undo brings back what you removed." : ""}</span>
              <button className="btn small" type="button" disabled={makingExamples} onClick={addExamples}>
                {makingExamples ? "Making examples..." : "Try two example files"}
              </button>
            </div>
          }
        />
      </Step>

      <Step id="pdf-save" number="03" label="Save" title="Save the result">
        <SavePanel pages={pages} docs={docs} />
      </Step>

      <PageViewer uid={viewing} pages={pages} docs={docsById} onShow={setViewing} onRotate={(uid) => dispatch({ type: "rotate", uids: [uid], deg: 90 })} />
    </>
  );
}
