import { useEffect, useState } from "react";
import { formatBytes, plural } from "../../shared/lib/format";
import { DropZone } from "../../shared/ui/DropZone";
import { IconChevronLeft, IconChevronRight, IconX } from "../../shared/ui/icons";
import { Step } from "../../shared/ui/Step";
import { useToast } from "../../shared/ui/Toast";
import { ConvertPanel } from "./ConvertPanel";
import { openImage, type ImageItem } from "./convert";
import { ImagePreview } from "./ImagePreview";
import { metadataLabels } from "./metadata";
import "./images.css";

/** Types every current browser can decode. HEIC isn't one of them outside Safari. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif";

// Kept in memory while you move around the app; gone when the tab closes.
let saved: ImageItem[] = [];

export default function ImagesTool() {
  const [items, setItems] = useState(saved);
  const [viewing, setViewing] = useState<number | null>(null);
  const toast = useToast();
  useEffect(() => {
    saved = items;
  }, [items]);

  const withLocation = items.filter((i) => i.meta.location || i.meta.extras.includes("GPS data")).length;
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);

  async function addFiles(files: File[], rejected: File[]) {
    const added: ImageItem[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        added.push(await openImage(file));
      } catch {
        problems.push(`${file.name} couldn't be opened.`);
      }
    }
    if (rejected.length) problems.push(rejected.length === 1 ? `${rejected[0].name} isn't an image this tool can read.` : `${rejected.length} files weren't supported images.`);
    if (added.length) {
      setItems((all) => [...all, ...added]);
      toast(`Added ${plural(added.length, "image")}.`);
    }
    if (problems.length) toast(problems.join(" "), "error");
  }

  /** Order matters for the combined PDF (one page per image) and for ZIP listings. */
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    setItems(next);
  }

  function remove(ids: number[]) {
    for (const item of items) if (ids.includes(item.id)) URL.revokeObjectURL(item.url);
    setItems(items.filter((i) => !ids.includes(i.id)));
  }

  return (
    <>
      <Step id="img-add" number="01" label="Add" title="Add your images">
        <DropZone accept={ACCEPT} buttonLabel="Add images" wholePage onFiles={addFiles}>
          Drop JPG, PNG, WebP, GIF, BMP or AVIF images anywhere on this page. They're read here, in the tab.
        </DropZone>
      </Step>

      <Step id="img-review" number="02" label="Review" title="Check what's hidden">
        <div className="summary">
          <span className="count" aria-live="polite">
            {items.length
              ? `${plural(items.length, "image")} · ${formatBytes(totalBytes)}` + (withLocation ? ` · ${withLocation} with location data` : "")
              : ""}
          </span>
          {items.length > 0 && (
            <button className="btn small ghost" type="button" onClick={() => remove(items.map((i) => i.id))}>
              Clear all
            </button>
          )}
        </div>
        {items.length ? (
          <ul className="cards" aria-label="Images">
            {items.map((item, i) => {
              const labels = metadataLabels(item.meta);
              return (
                <li key={item.id} className="card item">
                  <button className="thumb" type="button" aria-label={`Preview ${item.file.name}`} onClick={() => setViewing(item.id)}>
                    <img src={item.url} alt="" draggable={false} />
                  </button>
                  <span className="pos" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="info">
                    <b title={item.file.name}>{item.file.name}</b>
                    <span>
                      {item.width}×{item.height} · {formatBytes(item.file.size)}
                    </span>
                    <div className="tags" aria-label="Hidden data">
                      {labels.length ? (
                        labels.map((l) => (
                          <em key={l.label} className={l.warn ? "warn" : undefined}>
                            {l.label}
                          </em>
                        ))
                      ) : (
                        <em className="clean">No hidden data</em>
                      )}
                    </div>
                  </div>
                  <div className="order">
                    <button type="button" aria-label={`Move ${item.file.name} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <IconChevronLeft />
                    </button>
                    <button type="button" aria-label={`Move ${item.file.name} later`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                      <IconChevronRight />
                    </button>
                  </div>
                  <button className="remove" type="button" aria-label={`Remove ${item.file.name}`} onClick={() => remove([item.id])}>
                    <IconX size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">
            <b>No images yet</b>
            <span>Add photos to see what they carry: location, camera, date and more.</span>
          </div>
        )}
      </Step>

      <Step id="img-save" number="03" label="Save" title="Convert and save">
        <ConvertPanel items={items} />
      </Step>

      <ImagePreview id={viewing} items={items} onShow={setViewing} />
    </>
  );
}
