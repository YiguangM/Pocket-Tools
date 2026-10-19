import { IconX } from "./icons";
import "./FileChips.css";

export type FileChip = {
  id: string | number;
  name: string;
  /** Short facts, e.g. "3 p · 12 KB". */
  detail: string;
  badge?: string;
};

/** The row of loaded files, each with a remove button. Renders nothing when empty. */
export function FileChips({ items, onRemove, label = "Loaded files" }: { items: FileChip[]; onRemove: (id: FileChip["id"]) => void; label?: string }) {
  if (!items.length) return null;
  return (
    <ul className="files" aria-label={label}>
      {items.map((item) => (
        <li className="chip" key={item.id}>
          <b title={item.name}>{item.name}</b>
          <span>{item.detail}</span>
          {item.badge && <em>{item.badge}</em>}
          <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.id)}>
            <IconX size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
