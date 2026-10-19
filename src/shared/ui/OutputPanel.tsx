import { useRef, useState, type ReactNode } from "react";
import { ProgressBar } from "./ProgressBar";
import { Status, type StatusMessage } from "./Status";
import "./OutputPanel.css";

type Report = (fraction: number, where: string) => void;

/**
 * Runs one long task at a time with progress, cancel and a status line.
 * The task returns the success message; `explain` turns an error into one.
 */
export function useJob() {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(task: (signal: AbortSignal, report: Report) => Promise<string>, explain: (error: unknown) => string) {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setProgress(0);
    setStatus({ text: "Working..." });
    try {
      const message = await task(controller.signal, (fraction, where) => {
        setProgress(fraction);
        setStatus({ text: `Working: ${where}...` });
      });
      setStatus({ text: message });
    } catch (e) {
      setStatus(controller.signal.aborted ? { text: "Cancelled." } : { text: explain(e), error: true });
    } finally {
      abortRef.current = null;
      setWorking(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStatus({ text: "Cancelling..." });
  }

  return { working, progress, status, run, cancel };
}
export type Job = ReturnType<typeof useJob>;

type OutputPanelProps = {
  job: Job;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  /** Options for the output: choice cards, switches, notes. */
  children: ReactNode;
};

/** The "save" card that ends a tool: options on top, then the action button, cancel, status and progress. */
export function OutputPanel({ job, actionLabel, onAction, disabled = false, children }: OutputPanelProps) {
  return (
    <div className="card output">
      <div className="output-body">{children}</div>
      <div className="output-foot">
        <button className="btn primary" type="button" disabled={job.working || disabled} onClick={onAction}>
          {job.working ? "Working..." : actionLabel}
        </button>
        {job.working && (
          <button className="btn" type="button" onClick={job.cancel}>
            Cancel
          </button>
        )}
        <Status message={job.status} />
        <ProgressBar value={job.progress} label="Progress" hidden={!job.working} />
      </div>
    </div>
  );
}
