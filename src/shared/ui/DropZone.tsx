import { useEffect, useRef, useState, type ReactNode } from "react";
import { matchesAccept } from "../lib/accept";
import { IconUpload } from "./icons";
import "./DropZone.css";

type DropZoneProps = {
  /** Same syntax as <input accept>, e.g. ".pdf,application/pdf". */
  accept: string;
  buttonLabel: string;
  multiple?: boolean;
  /** Accept drops anywhere on the page, not just on the zone. */
  wholePage?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onFiles: (accepted: File[], rejected: File[]) => void;
};

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/** A file picker button plus a drop target. Files are read locally by the caller; this component never uploads. */
export function DropZone({ accept, buttonLabel, multiple = true, wholePage = false, disabled = false, children, onFiles }: DropZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Kept in a ref so the window listeners always see the latest props without re-subscribing.
  const deliver = useRef<(list: FileList | null) => void>(() => {});
  deliver.current = (list) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    onFiles(
      files.filter((f) => matchesAccept(f, accept)),
      files.filter((f) => !matchesAccept(f, accept)),
    );
  };

  useEffect(() => {
    const target: EventTarget | null = wholePage ? window : zoneRef.current;
    if (!target || disabled) return;
    let depth = 0;
    const enter = (e: Event) => {
      if (!hasFiles(e as DragEvent)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: Event) => {
      if (!hasFiles(e as DragEvent)) return;
      if (--depth <= 0) {
        depth = 0;
        setOver(false);
      }
    };
    const dragOver = (e: Event) => {
      const d = e as DragEvent;
      if (!hasFiles(d)) return;
      d.preventDefault();
      if (d.dataTransfer) d.dataTransfer.dropEffect = "copy";
    };
    const drop = (e: Event) => {
      const d = e as DragEvent;
      if (!hasFiles(d)) return;
      d.preventDefault();
      depth = 0;
      setOver(false);
      deliver.current(d.dataTransfer?.files ?? null);
    };
    target.addEventListener("dragenter", enter);
    target.addEventListener("dragleave", leave);
    target.addEventListener("dragover", dragOver);
    target.addEventListener("drop", drop);
    return () => {
      target.removeEventListener("dragenter", enter);
      target.removeEventListener("dragleave", leave);
      target.removeEventListener("dragover", dragOver);
      target.removeEventListener("drop", drop);
      setOver(false);
    };
  }, [wholePage, disabled]);

  return (
    <div className={"drop" + (over ? " over" : "")} ref={zoneRef}>
      <div className="drop-icon">
        <IconUpload size={20} />
      </div>
      <p>{children}</p>
      <button className="btn primary" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {buttonLabel}
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        aria-label={buttonLabel}
        onChange={(e) => {
          deliver.current(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
