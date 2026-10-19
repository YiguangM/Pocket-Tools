import { zipSync } from "fflate";
import { useId, useState, type KeyboardEvent } from "react";
import { downloadFile } from "../../shared/lib/download";
import { formatBytes, plural } from "../../shared/lib/format";
import { ChoiceCard } from "../../shared/ui/ChoiceCard";
import { DropZone } from "../../shared/ui/DropZone";
import { IconX } from "../../shared/ui/icons";
import { OutputPanel, useJob } from "../../shared/ui/OutputPanel";
import { PreviewModal } from "../../shared/ui/PreviewModal";
import { Step } from "../../shared/ui/Step";
import { useToast } from "../../shared/ui/Toast";
import { finish } from "./cutout";
import { cutouts, useCutouts, type CutoutItem } from "./store";
import "./background.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif";

type Background = "none" | "white" | "color";

const stem = (name: string) => name.replace(/\.[^.]+$/, "") || "image";

export default function BackgroundTool() {
  const { items, modelLoading } = useCutouts();
  const [viewing, setViewing] = useState<number | null>(null);
  const toast = useToast();
  const done = items.filter((i) => i.status === "done");
  const pending = items.filter((i) => i.status === "waiting" || i.status === "working").length;

  return (
    <>
      <Step id="bg-add" number="01" label="Add" title="Add your photos">
        <DropZone
          accept={ACCEPT}
          buttonLabel="Add photos"
          wholePage
          onFiles={(files, rejected) => {
            if (files.length) cutouts.add(files);
            if (rejected.length) toast(rejected.length === 1 ? `${rejected[0].name} isn't an image this tool can read.` : `${rejected.length} files weren't supported images.`, "error");
          }}
        >
          Works best on one clear subject: a person, a pet, a product. The AI model runs here, in the tab; photos are never sent anywhere.
        </DropZone>
      </Step>

      <Step id="bg-review" number="02" label="Review" title="Check the cutouts">
        <div className="summary">
          <span className="count" aria-live="polite">
            {!items.length
              ? ""
              : modelLoading
                ? "Loading the AI model (first time only)..."
                : pending
                  ? `Removing backgrounds: ${done.length} of ${items.length} done...`
                  : `${plural(done.length, "cutout")} ready`}
          </span>
          {items.length > 0 && (
            <button className="btn small ghost" type="button" onClick={() => cutouts.remove(items.map((i) => i.id))}>
              Clear all
            </button>
          )}
        </div>
        {items.length ? (
          <ul className="cards" aria-label="Photos">
            {items.map((item) => (
              <li key={item.id} className="card item">
                <button className="thumb checker" type="button" disabled={item.status !== "done"} aria-label={`Compare ${item.file.name}`} onClick={() => setViewing(item.id)}>
                  {item.cutout ? <img src={item.cutout.url} alt="" draggable={false} /> : <img className="faded" src={item.url} alt="" draggable={false} />}
                  {(item.status === "waiting" || item.status === "working") && <span className="badge">{item.status === "working" ? "Working..." : "Waiting"}</span>}
                </button>
                <div className="info">
                  <b title={item.file.name}>{item.file.name}</b>
                  <span>
                    {item.status === "failed" ? (
                      <>
                        Couldn't process this image.{" "}
                        <button className="link" type="button" onClick={() => cutouts.retry(item.id)}>
                          Try again
                        </button>
                      </>
                    ) : item.cutout ? (
                      `${item.cutout.width}×${item.cutout.height} · ${formatBytes(item.file.size)}`
                    ) : (
                      formatBytes(item.file.size)
                    )}
                  </span>
                </div>
                <button className="remove" type="button" aria-label={`Remove ${item.file.name}`} onClick={() => cutouts.remove([item.id])}>
                  <IconX size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <b>No photos yet</b>
            <span>Add a photo and its background disappears in a second or two.</span>
          </div>
        )}
      </Step>

      <Step id="bg-save" number="03" label="Save" title="Save the result">
        <SavePanel ready={done} />
      </Step>

      <Compare id={viewing} items={done} onShow={setViewing} />
    </>
  );
}

function SavePanel({ ready }: { ready: CutoutItem[] }) {
  const [background, setBackground] = useState<Background>("none");
  const [color, setColor] = useState("#2563eb");
  const job = useJob();
  const ids = useId();
  const fill = background === "white" ? "#ffffff" : background === "color" ? color : null;
  const label = ready.length === 1 ? "Save image" : ready.length > 1 ? `Save ${ready.length} images` : "Save images";

  function save() {
    const batch = ready.slice();
    if (!batch.length) return;
    void job.run(
      async (signal, report) => {
        const files: { name: string; blob: Blob }[] = [];
        for (const [k, item] of batch.entries()) {
          signal.throwIfAborted();
          const { blob, ext } = await finish(item.cutout!, fill);
          files.push({ name: `${stem(item.file.name)}-no-bg.${ext}`, blob });
          report((k + 1) / batch.length, `image ${k + 1} of ${batch.length}`);
        }
        if (files.length === 1) {
          downloadFile(files[0].name, files[0].blob);
          return `Saved ${files[0].name} (${formatBytes(files[0].blob.size)}).`;
        }
        const entries: Record<string, Uint8Array> = {};
        for (const f of files) {
          let name = f.name;
          for (let n = 2; name in entries; n++) name = f.name.replace(/(\.[^.]+)$/, ` (${n})$1`);
          entries[name] = new Uint8Array(await f.blob.arrayBuffer());
        }
        const zip = zipSync(entries, { level: 0 });
        downloadFile("backgrounds-removed.zip", zip, "application/zip");
        return `Saved ${plural(files.length, "image")} in a ZIP (${formatBytes(zip.length)}).`;
      },
      () => "Couldn't save the images.",
    );
  }

  return (
    <OutputPanel job={job} actionLabel={label} onAction={save} disabled={!ready.length}>
      <fieldset>
        <legend className="field-label">Background</legend>
        <div className="choices">
          <ChoiceCard name={`${ids}bg`} value="none" current={background} onPick={setBackground} title="Transparent">
            <small>PNG with a see-through background</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}bg`} value="white" current={background} onPick={setBackground} title="White">
            <small>JPG, ready for listings and IDs</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}bg`} value="color" current={background} onPick={setBackground} title="Colour">
            <small>
              JPG on{" "}
              <input type="color" value={color} aria-label="Background colour" onFocus={() => setBackground("color")} onChange={(e) => setColor(e.target.value)} />
            </small>
          </ChoiceCard>
        </div>
      </fieldset>
      <p className="note">
        Made with U²-Net, the model behind the open-source backgroundremover project. Saved images are redrawn, so hidden data such as location is
        removed.
      </p>
    </OutputPanel>
  );
}

function Compare({ id, items, onShow }: { id: number | null; items: CutoutItem[]; onShow: (id: number | null) => void }) {
  const index = id === null ? -1 : items.findIndex((i) => i.id === id);
  const item = index >= 0 ? items[index] : undefined;
  const prev = () => index > 0 && onShow(items[index - 1].id);
  const next = () => index >= 0 && index < items.length - 1 && onShow(items[index + 1].id);
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowLeft") (e.preventDefault(), prev());
    else if (e.key === "ArrowRight") (e.preventDefault(), next());
  };
  return (
    <PreviewModal
      open={!!item}
      label="Before and after"
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
      {item?.cutout && (
        <div className="compare">
          <figure>
            <img src={item.url} alt={`${item.file.name}, original`} />
            <figcaption>Before</figcaption>
          </figure>
          <figure>
            <img className="checker" src={item.cutout.url} alt={`${item.file.name}, background removed`} />
            <figcaption>After</figcaption>
          </figure>
        </div>
      )}
    </PreviewModal>
  );
}
