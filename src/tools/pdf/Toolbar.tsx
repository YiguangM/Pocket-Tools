import type { Dispatch } from "react";
import { IconRotateLeft, IconRotateRight } from "../../shared/ui/icons";
import type { Action } from "./model";

type ToolbarProps = {
  pageCount: number;
  selected: number[];
  canUndo: boolean;
  canClear: boolean;
  dispatch: Dispatch<Action>;
};

export function Toolbar({ pageCount, selected, canUndo, canClear, dispatch }: ToolbarProps) {
  const none = !selected.length;
  return (
    <div className="card tools" role="group" aria-label="Page tools">
      <button className="btn small ghost" type="button" disabled={!pageCount} onClick={() => dispatch({ type: "selectAll" })}>
        Select all
      </button>
      <button className="btn small ghost" type="button" disabled={none} onClick={() => dispatch({ type: "selectNone" })}>
        Select none
      </button>
      <span className="sep" />
      <button className="btn small ghost" type="button" disabled={none} aria-label="Rotate selected pages left" onClick={() => dispatch({ type: "rotate", uids: selected, deg: -90 })}>
        <IconRotateLeft size={15} />
        Left
      </button>
      <button className="btn small ghost" type="button" disabled={none} aria-label="Rotate selected pages right" onClick={() => dispatch({ type: "rotate", uids: selected, deg: 90 })}>
        <IconRotateRight size={15} />
        Right
      </button>
      <button className="btn small ghost" type="button" disabled={none} onClick={() => dispatch({ type: "remove", uids: selected })}>
        Delete
      </button>
      <button className="btn small ghost" type="button" disabled={pageCount < 2} onClick={() => dispatch({ type: "reverse" })}>
        Reverse
      </button>
      <span className="sp" />
      <button className="btn small ghost" type="button" disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
        Undo
      </button>
      <button className="btn small ghost" type="button" disabled={!canClear} onClick={() => dispatch({ type: "clear" })}>
        Clear all
      </button>
    </div>
  );
}
