import { memo, useLayoutEffect, useRef, useState, type Dispatch, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { IconCheck, IconChevronLeft, IconChevronRight, IconRotateRight, IconSearch, IconX } from "../../shared/ui/icons";
import type { Action, PageRef } from "./model";
import { useThumbnail } from "./thumbnails";

const DRAG_TYPE = "application/x-pocket-tools-page";

type PageGridProps = {
  pages: PageRef[];
  docNames: Map<number, string>;
  dispatch: Dispatch<Action>;
  onPreview: (uid: number) => void;
  /** Shown in place of the grid when there are no pages. */
  empty: ReactNode;
};

type FocusTarget = { uid: number; index: number; act?: string };
type DropMark = { uid: number; after: boolean };

function tileOf(target: EventTarget): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".tile") : null;
}

/**
 * The page tiles. Events are handled once on the list (clicks, keys, drag and
 * drop) and tiles stay simple, so a selection change re-renders one tile.
 */
export function PageGrid({ pages, docNames, dispatch, onPreview, empty }: PageGridProps) {
  const gridRef = useRef<HTMLUListElement>(null);
  const refocus = useRef<FocusTarget | null>(null);
  const [dragUid, setDragUid] = useState<number | null>(null);
  const [mark, setMark] = useState<DropMark | null>(null);

  // After a move or delete made from the grid, keep focus where the user was working.
  useLayoutEffect(() => {
    const target = refocus.current;
    const grid = gridRef.current;
    refocus.current = null;
    if (!target || !grid) return;
    let tile = grid.querySelector<HTMLElement>(`.tile[data-uid="${target.uid}"]`);
    let act = target.act;
    if (!tile) {
      const tiles = grid.querySelectorAll<HTMLElement>(".tile");
      tile = tiles[Math.min(target.index, tiles.length - 1)] ?? null;
      act = undefined;
    }
    if (!tile) return;
    const button = act ? tile.querySelector<HTMLButtonElement>(`[data-act="${act}"]`) : null;
    (button && !button.disabled ? button : tile).focus();
  }, [pages]);

  const find = (tile: HTMLElement) => {
    const uid = Number(tile.dataset.uid);
    return { uid, i: pages.findIndex((p) => p.uid === uid) };
  };
  const move = (uid: number, i: number, to: number, act?: string) => {
    if (to < 0 || to >= pages.length || to === i) return;
    refocus.current = { uid, index: i, act };
    dispatch({ type: "move", uid, to });
  };
  const remove = (uid: number, i: number) => {
    refocus.current = { uid, index: i };
    dispatch({ type: "remove", uids: [uid] });
  };

  const onClick = (e: MouseEvent<HTMLUListElement>) => {
    const tile = tileOf(e.target);
    if (!tile) return;
    const { uid, i } = find(tile);
    if (i < 0) return;
    const act = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset.act ?? "sel";
    if (act === "sel") dispatch({ type: "toggle", uid });
    else if (act === "left") move(uid, i, i - 1, act);
    else if (act === "right") move(uid, i, i + 1, act);
    else if (act === "rot") dispatch({ type: "rotate", uids: [uid], deg: 90 });
    else if (act === "del") remove(uid, i);
    else if (act === "zoom") onPreview(uid);
  };

  const onDoubleClick = (e: MouseEvent<HTMLUListElement>) => {
    const tile = tileOf(e.target);
    if (tile && !(e.target as Element).closest("[data-act]")) onPreview(find(tile).uid);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const tile = e.target as HTMLElement;
    if (!tile.classList.contains("tile") || e.ctrlKey || e.metaKey || e.altKey) return;
    const { uid, i } = find(tile);
    if (i < 0) return;
    const tiles = Array.from(gridRef.current?.querySelectorAll<HTMLElement>(".tile") ?? []);
    const cols = Math.max(1, tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length);
    const clamp = (j: number) => Math.max(0, Math.min(tiles.length - 1, j));
    const go = (j: number) => tiles[clamp(j)]?.focus();
    const steps: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    const step = steps[e.key];

    if (step !== undefined) {
      e.preventDefault();
      if (e.shiftKey) move(uid, i, clamp(i + step));
      else go(i + step);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      go(e.key === "Home" ? 0 : tiles.length - 1);
    } else if (e.key === " ") {
      e.preventDefault();
      dispatch({ type: "toggle", uid });
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPreview(uid);
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      dispatch({ type: "rotate", uids: [uid], deg: e.shiftKey ? -90 : 90 });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(uid, i);
    }
  };

  const endDrag = () => {
    setDragUid(null);
    setMark(null);
  };

  const onDragStart = (e: DragEvent<HTMLUListElement>) => {
    const tile = tileOf(e.target);
    if (!tile) return;
    setDragUid(find(tile).uid);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_TYPE, tile.dataset.uid ?? "");
  };

  const onDragOver = (e: DragEvent<HTMLUListElement>) => {
    if (dragUid === null) return;
    const tile = tileOf(e.target);
    if (!tile) return;
    const uid = Number(tile.dataset.uid);
    if (uid === dragUid) return setMark(null);
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = tile.getBoundingClientRect();
    const after = e.clientX >= r.left + r.width / 2;
    setMark((m) => (m?.uid === uid && m.after === after ? m : { uid, after }));
  };

  const onDrop = (e: DragEvent<HTMLUListElement>) => {
    if (dragUid === null) return;
    e.preventDefault();
    const tile = tileOf(e.target);
    if (tile) {
      const target = Number(tile.dataset.uid);
      const r = tile.getBoundingClientRect();
      if (target !== dragUid) dispatch({ type: "place", uid: dragUid, target, after: e.clientX >= r.left + r.width / 2 });
    }
    endDrag();
  };

  if (!pages.length) return <div className="grid-empty">{empty}</div>;

  return (
    <ul
      ref={gridRef}
      className="grid"
      aria-label="Pages"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={endDrag}
    >
      {pages.map((page, i) => (
        <Tile
          key={page.uid}
          page={page}
          position={i + 1}
          total={pages.length}
          docName={docNames.get(page.docId) ?? ""}
          dragging={page.uid === dragUid}
          mark={mark?.uid === page.uid ? (mark.after ? "after" : "before") : undefined}
        />
      ))}
    </ul>
  );
}

type TileProps = {
  page: PageRef;
  position: number;
  total: number;
  docName: string;
  dragging: boolean;
  mark?: "before" | "after";
};

const Tile = memo(function Tile({ page, position: n, total, docName, dragging, mark }: TileProps) {
  const thumb = useThumbnail(page.docId, page.index);
  const cls = ["tile", page.sel && "sel", dragging && "dragging", mark && `drop-${mark}`].filter(Boolean).join(" ");
  return (
    <li
      className={cls}
      role="group"
      tabIndex={0}
      draggable
      data-uid={page.uid}
      aria-label={`Page ${n} of ${total}, ${docName} page ${page.index + 1}, ${page.sel ? "selected" : "not selected"}`}
    >
      <div className="thumb">
        {thumb?.url ? (
          <img alt="" draggable={false} src={thumb.url} data-rot={page.rot} />
        ) : thumb?.failed ? (
          <span className="no-preview">No preview</span>
        ) : (
          <span className="ph" />
        )}
      </div>
      <button className="zoom" type="button" data-act="zoom" aria-label={`Preview page ${n}`}>
        <IconSearch size={14} />
      </button>
      <button className="check" type="button" data-act="sel" aria-pressed={page.sel} aria-label={`Select page ${n}`}>
        {page.sel && <IconCheck size={14} />}
      </button>
      <div className="meta">
        <b>{n}</b>
        <span className="src" title={docName}>
          {docName} &middot; p{page.index + 1}
        </span>
      </div>
      <div className="acts">
        <button type="button" data-act="left" aria-label={`Move page ${n} earlier`} disabled={n === 1}>
          <IconChevronLeft />
        </button>
        <button type="button" data-act="right" aria-label={`Move page ${n} later`} disabled={n === total}>
          <IconChevronRight />
        </button>
        <button type="button" data-act="rot" aria-label={`Rotate page ${n}`}>
          <IconRotateRight />
        </button>
        <button type="button" data-act="del" aria-label={`Delete page ${n}`}>
          <IconX size={14} />
        </button>
      </div>
    </li>
  );
});
