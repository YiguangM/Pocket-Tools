import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconX } from "./icons";
import "./Toast.css";

type Tone = "info" | "error";
type Toast = { id: number; text: string; tone: Tone };
type ShowToast = (text: string, tone?: Tone) => void;

const ToastContext = createContext<ShowToast>(() => {});
let nextId = 0;

/** Hosts short-lived notices at the bottom of the screen. Mount once, near the app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>(
    (text, tone = "info") => {
      const id = ++nextId;
      setToasts((all) => [...all.slice(-2), { id, text, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* The live region stays mounted so screen readers announce each new notice. */}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast" + (t.tone === "error" ? " err" : "")}>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
