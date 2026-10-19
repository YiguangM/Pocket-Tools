import "./Status.css";

export type StatusMessage = { text: string; error?: boolean };

/** An inline, politely announced status line for a long-running action. */
export function Status({ message }: { message: StatusMessage | null }) {
  return (
    <span className={"status" + (message?.error ? " err" : "")} role="status" aria-live="polite">
      {message?.text ?? ""}
    </span>
  );
}
