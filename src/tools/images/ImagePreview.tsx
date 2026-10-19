import type { KeyboardEvent } from "react";
import { formatBytes } from "../../shared/lib/format";
import { PreviewModal } from "../../shared/ui/PreviewModal";
import type { ImageItem } from "./convert";

/** The original image, large, with everything hidden inside it spelled out. */
export function ImagePreview({ id, items, onShow }: { id: number | null; items: ImageItem[]; onShow: (id: number | null) => void }) {
  const index = id === null ? -1 : items.findIndex((i) => i.id === id);
  const item = index >= 0 ? items[index] : undefined;
  const prev = () => index > 0 && onShow(items[index - 1].id);
  const next = () => index >= 0 && index < items.length - 1 && onShow(items[index + 1].id);
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowLeft") (e.preventDefault(), prev());
    else if (e.key === "ArrowRight") (e.preventDefault(), next());
  };

  const meta = item?.meta;
  const rows: [string, string][] = item
    ? [
        ["Size", `${item.width} × ${item.height} px, ${formatBytes(item.file.size)}`],
        ["Type", item.file.type || "unknown"],
        ...(meta?.location ? [["Location", `${meta.location.lat.toFixed(5)}, ${meta.location.lon.toFixed(5)}`] as [string, string]] : []),
        ...(meta?.camera ? [["Camera", meta.camera] as [string, string]] : []),
        ...(meta?.taken ? [["Taken", meta.taken] as [string, string]] : []),
        ...(meta?.software ? [["Software", meta.software] as [string, string]] : []),
        ...(meta?.extras.length ? [["Also", meta.extras.join(", ")] as [string, string]] : []),
      ]
    : [];
  const hasHidden = !!meta && (!!meta.location || !!meta.camera || !!meta.taken || !!meta.software || meta.extras.length > 0);

  return (
    <PreviewModal
      open={!!item}
      label="Image preview"
      title={item ? `${item.file.name} · ${index + 1} of ${items.length}` : ""}
      onClose={() => onShow(null)}
      onKeyDown={onKeyDown}
      actions={
        <>
          <button className="btn small" type="button" disabled={index <= 0} onClick={prev}>
            Previous
          </button>
          <button className="btn small" type="button" disabled={index < 0 || index >= items.length - 1} onClick={next}>
            Next
          </button>
        </>
      }
    >
      {item && (
        <div className="preview">
          <img src={item.url} alt={item.file.name} />
          <dl>
            {rows.map(([k, v]) => (
              <div key={k} className={k === "Location" ? "warn" : undefined}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <p className="verdict">{hasHidden ? "All of this is removed when you save." : "No hidden data found."}</p>
          </dl>
        </div>
      )}
    </PreviewModal>
  );
}
