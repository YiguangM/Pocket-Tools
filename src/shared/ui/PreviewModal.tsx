import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import "./PreviewModal.css";

type PreviewModalProps = {
  open: boolean;
  /** Accessible name of the dialog. */
  label: string;
  /** Shown in the top bar. */
  title: ReactNode;
  /** Buttons placed before Close. */
  actions?: ReactNode;
  onClose: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDialogElement>) => void;
  children: ReactNode;
};

/**
 * Full-screen preview shell on a native modal <dialog>: the page behind is
 * inert, Escape closes it, and focus returns to whatever opened it.
 * Clicking the empty stage around the content also closes it.
 */
export function PreviewModal({ open, label, title, actions, onClose, onKeyDown, children }: PreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="viewer"
      aria-label={label}
      onKeyDown={onKeyDown}
      onClose={() => {
        const opener = openerRef.current;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        onClose();
      }}
    >
      <div className="viewer-bar">
        <span className="viewer-title">{title}</span>
        {actions}
        <button ref={closeRef} className="btn small primary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div
        className="viewer-stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {children}
      </div>
    </dialog>
  );
}
