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
import { upscales, useUpscales, type UpscaleItem } from "./store";
import { fitsOutput, planTiles } from "./tiles";
import { TooLargeError, upscaleImage } from "./upscale";
import "./upscale.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif";
type Scale = "2" | "4";
type Format = "png" | "jpeg";
const stem = (name: string) => name.replace(/\.[^.]+$/, "") || "image";

export default function UpscaleTool() {
  const items = useUpscales();
  const [scale, setScale] = useState<Scale>("4");
  const [format, setFormat] = useState<Format>("png");
  const [viewing, setViewing] = useState<number | null>(null);
  const toast = useToast();
  const job = useJob();
  const ids = useId();
  const factor = Number(scale) as 2 | 4;
  const key = `${scale}:${format}`;
  const usable = items.filter((i) => fitsOutput(i.width, i.height, factor));
  const label = usable.length === 1 ? "Upscale and save" : usable.length > 1 ? `Upscale ${usable.length} images` : "Upscale";

  function save() {
    const batch = usable.slice();
    if (!batch.length) return;
    const type = format === "png" ? "image/png" : "image/jpeg";
    const ext = format === "png" ? "png" : "jpg";
    const tilesIn = (i: UpscaleItem) => planTiles(i.width, i.height).length;
    const total = batch.reduce((sum, i) => sum + (i.result?.key === key ? 0 : tilesIn(i)), 0);
    let done = 0;
    void job.run(
      async (signal, report) => {
        const files: { name: string; blob: Blob }[] = [];
        for (const [k, item] of batch.entries()) {
          let result = item.result?.key === key ? item.result : undefined; // reuse an earlier run with the same settings
          if (!result) {
            const made = await upscaleImage(item.file, factor, type, (part, parts) => {
              report((done + part) / Math.max(1, total), `image ${k + 1} of ${batch.length}, part ${part} of ${parts}`);
            }, signal);
            done += tilesIn(item);
            result = { ...made, key };
            upscales.setResult(item.id, result);
          }
          files.push({ name: `${stem(item.file.name)}-${scale}x.${ext}`, blob: result.blob });
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
        downloadFile("upscaled-images.zip", zip, "application/zip");
        return `Saved ${plural(files.length, "image")} in a ZIP (${formatBytes(zip.length)}).`;
      },
      (e) => (e instanceof TooLargeError ? e.message : "Couldn't upscale the images."),
    );
  }

  return (
    <>
      <Step id="up-add" number="01" label="Add" title="Add your images">
        <DropZone
          accept={ACCEPT}
          buttonLabel="Add images"
          wholePage
          onFiles={async (files, rejected) => {
            const problems = files.length ? await upscales.add(files) : [];
            if (rejected.length) problems.push(rejected.length === 1 ? `${rejected[0].name} isn't an image this tool can read.` : `${rejected.length} files weren't supported images.`);
            if (problems.length) toast(problems.join(" "), "error");
          }}
        >
          Small, blurry or old photos work best. The AI runs here, in the tab, so it takes a little while; your images are never sent anywhere.
        </DropZone>
      </Step>

      <Step id="up-review" number="02" label="Review" title="Check the sizes">
        <div className="summary">
          <span className="count">{items.length ? `${plural(items.length, "image")}` : ""}</span>
          {items.length > 0 && (
            <button className="btn small ghost" type="button" disabled={job.working} onClick={() => upscales.remove(items.map((i) => i.id))}>
              Clear all
            </button>
          )}
        </div>
        {items.length ? (
          <ul className="cards" aria-label="Images">
            {items.map((item) => {
              const fits = fitsOutput(item.width, item.height, factor);
              const ready = item.result?.key === key;
              return (
                <li key={item.id} className="card item">
                  <button className="thumb" type="button" disabled={!item.result} aria-label={`Compare ${item.file.name}`} onClick={() => setViewing(item.id)}>
                    <img src={item.result?.url ?? item.url} alt="" draggable={false} />
                    {ready && <span className="badge">Done</span>}
                  </button>
                  <div className="info">
                    <b title={item.file.name}>{item.file.name}</b>
                    <span>
                      {item.width}×{item.height} → {item.width * factor}×{item.height * factor}
                    </span>
                    {!fits && <span className="warn">Too large for {scale}x here; try 2x or shrink it first.</span>}
                  </div>
                  <button className="remove" type="button" disabled={job.working} aria-label={`Remove ${item.file.name}`} onClick={() => upscales.remove([item.id])}>
                    <IconX size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">
            <b>No images yet</b>
            <span>Add an image to make it 2 or 4 times bigger, with detail filled in by AI.</span>
          </div>
        )}
      </Step>

      <Step id="up-save" number="03" label="Save" title="Upscale and save">
        <OutputPanel job={job} actionLabel={label} onAction={save} disabled={!usable.length}>
          <fieldset>
            <legend className="field-label">Scale</legend>
            <div className="choices">
              <ChoiceCard name={`${ids}scale`} value="2" current={scale} onPick={setScale} title="2x">
                <small>Twice the width and height</small>
              </ChoiceCard>
              <ChoiceCard name={`${ids}scale`} value="4" current={scale} onPick={setScale} title="4x">
                <small>Four times; the model's native size</small>
              </ChoiceCard>
            </div>
          </fieldset>
          <fieldset>
            <legend className="field-label">Format</legend>
            <div className="choices">
              <ChoiceCard name={`${ids}format`} value="png" current={format} onPick={setFormat} title="PNG">
                <small>Best quality, keeps transparency</small>
              </ChoiceCard>
              <ChoiceCard name={`${ids}format`} value="jpeg" current={format} onPick={setFormat} title="JPG">
                <small>Much smaller files</small>
              </ChoiceCard>
            </div>
          </fieldset>
          <p className="note">
            Uses Real-ESRGAN, the model family behind Upscayl, on your processor: about a minute for a 1000×1000 photo. Saved images carry no hidden data
            from the original.
          </p>
        </OutputPanel>
      </Step>

      <Compare id={viewing} items={items.filter((i) => i.result)} onShow={setViewing} />
    </>
  );
}

function Compare({ id, items, onShow }: { id: number | null; items: UpscaleItem[]; onShow: (id: number | null) => void }) {
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
      title={item?.result ? `${item.file.name} · ${item.width}×${item.height} → ${item.result.width}×${item.result.height}` : ""}
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
      {item?.result && (
        <div className="compare">
          <figure>
            <img src={item.url} alt={`${item.file.name}, original enlarged by the browser`} />
            <figcaption>Before (simply enlarged)</figcaption>
          </figure>
          <figure>
            <img src={item.result.url} alt={`${item.file.name}, upscaled`} />
            <figcaption>After (AI upscaled)</figcaption>
          </figure>
        </div>
      )}
    </PreviewModal>
  );
}
