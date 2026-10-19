import type { PDFDocumentProxy } from "pdfjs-dist";
import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, initialState, reducer, type Action, type LoadedDoc, type PageRef, type State } from "./model";

function doc(id: number, pageCount: number): LoadedDoc {
  return { id, name: `doc${id}.pdf`, bytes: new Uint8Array(), pdf: {} as PDFDocumentProxy, pageCount, example: false };
}
function pagesOf(d: LoadedDoc, firstUid: number): PageRef[] {
  return Array.from({ length: d.pageCount }, (_, index) => ({ uid: firstUid + index, docId: d.id, index, rot: 0, sel: false }));
}
function run(state: State, ...actions: Action[]): State {
  return actions.reduce(reducer, state);
}
const uids = (s: State) => s.pages.map((p) => p.uid);

/** Two docs: uids 1-3 from doc 1, uids 4-5 from doc 2. */
function loaded(): State {
  const a = doc(1, 3);
  const b = doc(2, 2);
  return run(initialState, { type: "add", docs: [a, b], pages: [...pagesOf(a, 1), ...pagesOf(b, 4)] });
}

describe("pdf page model", () => {
  it("adds docs and pages as one undoable step", () => {
    const s = loaded();
    expect(uids(s)).toEqual([1, 2, 3, 4, 5]);
    expect(s.history).toHaveLength(1);
    expect(run(s, { type: "undo" })).toMatchObject({ docs: [], pages: [], history: [] });
  });

  it("moves a page by index", () => {
    expect(uids(run(loaded(), { type: "move", uid: 1, to: 1 }))).toEqual([2, 1, 3, 4, 5]);
    expect(uids(run(loaded(), { type: "move", uid: 5, to: 0 }))).toEqual([5, 1, 2, 3, 4]);
  });

  it("ignores moves past either end", () => {
    const s = loaded();
    expect(run(s, { type: "move", uid: 1, to: -1 })).toBe(s);
    expect(run(s, { type: "move", uid: 5, to: 5 })).toBe(s);
  });

  it("places a dragged page before or after a target", () => {
    expect(uids(run(loaded(), { type: "place", uid: 1, target: 4, after: false }))).toEqual([2, 3, 1, 4, 5]);
    expect(uids(run(loaded(), { type: "place", uid: 1, target: 4, after: true }))).toEqual([2, 3, 4, 1, 5]);
    expect(uids(run(loaded(), { type: "place", uid: 5, target: 1, after: false }))).toEqual([5, 1, 2, 3, 4]);
  });

  it("treats a drop that changes nothing as a no-op", () => {
    const s = loaded();
    expect(run(s, { type: "place", uid: 2, target: 3, after: false })).toBe(s);
    expect(run(s, { type: "place", uid: 2, target: 2, after: true })).toBe(s);
  });

  it("rotates in quarter turns and wraps around", () => {
    const s = run(loaded(), { type: "rotate", uids: [1], deg: -90 }, { type: "rotate", uids: [1, 2], deg: 90 }, { type: "rotate", uids: [2], deg: 90 });
    expect(s.pages.slice(0, 3).map((p) => p.rot)).toEqual([0, 180, 0]);
  });

  it("removes pages and brings them back with undo", () => {
    const s = run(loaded(), { type: "remove", uids: [2, 4] });
    expect(uids(s)).toEqual([1, 3, 5]);
    expect(uids(run(s, { type: "undo" }))).toEqual([1, 2, 3, 4, 5]);
  });

  it("removes a doc together with its pages", () => {
    const s = run(loaded(), { type: "removeDoc", docId: 1 });
    expect(s.docs.map((d) => d.id)).toEqual([2]);
    expect(uids(s)).toEqual([4, 5]);
  });

  it("reverses and clears", () => {
    expect(uids(run(loaded(), { type: "reverse" }))).toEqual([5, 4, 3, 2, 1]);
    expect(run(loaded(), { type: "clear" })).toMatchObject({ docs: [], pages: [] });
  });

  it("keeps selection out of the undo history", () => {
    const s = run(loaded(), { type: "toggle", uid: 2 }, { type: "selectAll" }, { type: "selectNone" }, { type: "toggle", uid: 3 });
    expect(s.history).toHaveLength(1);
    expect(s.pages.filter((p) => p.sel).map((p) => p.uid)).toEqual([3]);
  });

  it("caps the undo history", () => {
    let s = loaded();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = reducer(s, { type: "reverse" });
    expect(s.history).toHaveLength(HISTORY_LIMIT);
  });

  it("does nothing on undo with no history", () => {
    expect(reducer(initialState, { type: "undo" })).toBe(initialState);
  });
});
