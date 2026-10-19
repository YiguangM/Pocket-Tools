import type { PDFDocumentProxy } from "pdfjs-dist";

export type Rotation = 0 | 90 | 180 | 270;

/** A PDF the user added, kept in memory only. */
export type LoadedDoc = {
  id: number;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  pageCount: number;
  example: boolean;
};

/** One tile in the grid: a page of a loaded doc plus the user's edits to it. */
export type PageRef = {
  uid: number;
  docId: number;
  /** Zero-based page index inside the source doc. */
  index: number;
  /** Added on top of the page's own rotation. */
  rot: Rotation;
  sel: boolean;
};

type Snapshot = { docs: LoadedDoc[]; pages: PageRef[] };
export type State = Snapshot & { history: Snapshot[] };

export const HISTORY_LIMIT = 30;
export const initialState: State = { docs: [], pages: [], history: [] };

export type Action =
  | { type: "add"; docs: LoadedDoc[]; pages: PageRef[] }
  | { type: "removeDoc"; docId: number }
  | { type: "toggle"; uid: number }
  | { type: "selectAll" }
  | { type: "selectNone" }
  /** Move a page to index `to` of the list. */
  | { type: "move"; uid: number; to: number }
  /** Move a page next to another one (drag and drop). */
  | { type: "place"; uid: number; target: number; after: boolean }
  | { type: "rotate"; uids: number[]; deg: 90 | -90 }
  | { type: "remove"; uids: number[] }
  | { type: "reverse" }
  | { type: "clear" }
  | { type: "undo" };

export function normalizeRotation(deg: number): Rotation {
  return ((((deg % 360) + 360) % 360) as Rotation);
}

/** Applies an undoable change: the current docs and pages become the newest history entry. */
function commit(state: State, next: Snapshot): State {
  return { ...next, history: [...state.history, { docs: state.docs, pages: state.pages }].slice(-HISTORY_LIMIT) };
}

function withSelection(state: State, sel: boolean): State {
  if (state.pages.every((p) => p.sel === sel)) return state;
  return { ...state, pages: state.pages.map((p) => (p.sel === sel ? p : { ...p, sel })) };
}

/** Selection changes are not undoable; everything that changes the output is. */
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add":
      return commit(state, { docs: [...state.docs, ...action.docs], pages: [...state.pages, ...action.pages] });

    case "removeDoc":
      if (!state.docs.some((d) => d.id === action.docId)) return state;
      return commit(state, {
        docs: state.docs.filter((d) => d.id !== action.docId),
        pages: state.pages.filter((p) => p.docId !== action.docId),
      });

    case "toggle":
      return { ...state, pages: state.pages.map((p) => (p.uid === action.uid ? { ...p, sel: !p.sel } : p)) };

    case "selectAll":
      return withSelection(state, true);

    case "selectNone":
      return withSelection(state, false);

    case "move": {
      const from = state.pages.findIndex((p) => p.uid === action.uid);
      const to = action.to;
      if (from < 0 || to < 0 || to >= state.pages.length || from === to) return state;
      const pages = state.pages.slice();
      const [page] = pages.splice(from, 1);
      pages.splice(to, 0, page);
      return commit(state, { docs: state.docs, pages });
    }

    case "place": {
      const from = state.pages.findIndex((p) => p.uid === action.uid);
      if (from < 0 || action.uid === action.target) return state;
      const pages = state.pages.slice();
      const [page] = pages.splice(from, 1);
      const at = pages.findIndex((p) => p.uid === action.target);
      if (at < 0) return state;
      const to = action.after ? at + 1 : at;
      if (to === from) return state;
      pages.splice(to, 0, page);
      return commit(state, { docs: state.docs, pages });
    }

    case "rotate": {
      if (!action.uids.length) return state;
      const uids = new Set(action.uids);
      return commit(state, {
        docs: state.docs,
        pages: state.pages.map((p) => (uids.has(p.uid) ? { ...p, rot: normalizeRotation(p.rot + action.deg) } : p)),
      });
    }

    case "remove": {
      const uids = new Set(action.uids);
      if (!state.pages.some((p) => uids.has(p.uid))) return state;
      return commit(state, { docs: state.docs, pages: state.pages.filter((p) => !uids.has(p.uid)) });
    }

    case "reverse":
      if (state.pages.length < 2) return state;
      return commit(state, { docs: state.docs, pages: state.pages.slice().reverse() });

    case "clear":
      if (!state.docs.length && !state.pages.length) return state;
      return commit(state, { docs: [], pages: [] });

    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { ...previous, history: state.history.slice(0, -1) };
    }
  }
}
