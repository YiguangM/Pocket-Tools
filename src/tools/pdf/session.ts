import { useEffect, useReducer } from "react";
import { initialState, reducer, type Action, type LoadedDoc, type PageRef, type State } from "./model";
import { openPdf } from "./pdfjs";
import { thumbnails } from "./thumbnails";

/*
 * The session lives at module level, in memory only, so going back to the
 * tool list and returning doesn't lose work. Closing or reloading the tab
 * clears it.
 */
let saved: State = initialState;
let lastDocId = 0;
let lastUid = 0;

/** Docs we opened and haven't destroyed yet. `seen` turns true once a committed state has held the doc. */
const live = new Map<number, { doc: LoadedDoc; seen: boolean }>();

/** Destroys docs that neither the current state nor the undo history can reach. */
function collect(state: State) {
  const reachable = new Set<number>();
  for (const snap of [state, ...state.history]) for (const d of snap.docs) reachable.add(d.id);
  for (const [id, entry] of live) {
    if (reachable.has(id)) entry.seen = true;
    else if (entry.seen) {
      live.delete(id);
      thumbnails.forget(id);
      void entry.doc.pdf.loadingTask.destroy();
    }
  }
}

export function usePdfSession() {
  const [state, dispatch] = useReducer(reducer, saved);
  useEffect(() => {
    saved = state;
    collect(state);
  }, [state]);
  return [state, dispatch] as const;
}

/** Parses a file with pdf.js. Throws on damaged or password-protected files. */
export async function openDoc(name: string, bytes: Uint8Array, example = false): Promise<LoadedDoc> {
  const pdf = await openPdf(bytes);
  return { id: ++lastDocId, name, bytes, pdf, pageCount: pdf.numPages, example };
}

/** The action that adds opened docs (all their pages, in order) and starts their thumbnails. */
export function addDocs(docs: LoadedDoc[]): Action {
  const pages: PageRef[] = [];
  for (const doc of docs) {
    live.set(doc.id, { doc, seen: false });
    thumbnails.requestAll(doc);
    for (let index = 0; index < doc.pageCount; index++) pages.push({ uid: ++lastUid, docId: doc.id, index, rot: 0, sel: false });
  }
  return { type: "add", docs, pages };
}
