import "./ProgressBar.css";

/** A thin determinate progress bar. `value` runs from 0 to 1. */
export function ProgressBar({ value, label, hidden = false }: { value: number; label: string; hidden?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} hidden={hidden}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
