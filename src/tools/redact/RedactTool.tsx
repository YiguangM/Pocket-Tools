import { zipSync } from "fflate";
import { useId, useState } from "react";
import { downloadFile } from "../../shared/lib/download";
import { formatBytes, plural } from "../../shared/lib/format";
import { ChoiceCard } from "../../shared/ui/ChoiceCard";
import { DropZone } from "../../shared/ui/DropZone";
import { IconX } from "../../shared/ui/icons";
import { OutputPanel, useJob } from "../../shared/ui/OutputPanel";
import { Step } from "../../shared/ui/Step";
import { useToast } from "../../shared/ui/Toast";
import { Editor } from "./Editor";
import { hideArea, type Effect } from "./effects";
import { redactions, useRedactions, type Kind, type RedactItem } from "./store";
import "./redact.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif";
const KINDS: { kind: Kind; one: string; many: string }[] = [
  { kind: "face", one: "face", many: "faces" },
  { kind: "plate", one: "plate", many: "plates" },
  { kind: "text", one: "text area", many: "text areas" },
  { kind: "manual", one: "own area", many: "own areas" },
];
const STATUS: Partial<Record<RedactItem["status"], string>> = {
  waiting: "Waiting...",
  faces: "Looking for faces",
  plates: "Looking for license plates...",
  text: "Looking for text...",
  failed: "Couldn't scan this photo. You can still drag to mark areas yourself.",
};
const stem = (name: string) => name.replace(/\.[^.]+$/, "") || "photo";

/** Writes the photo at full size with the chosen areas hidden. Redrawn, so hidden metadata (like GPS) is gone too. */
async function render(item: RedactItem, effect: Effect, strength: number): Promise<{ blob: Blob; name: string }> {
  const { bitmap } = item;
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  try {
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    for (const r of item.regions) if (r.on) hideArea(ctx, bitmap, 1, r, effect, strength);
    const [mime, ext] = item.file.type === "image/jpeg" ? ["image/jpeg", "jpg"] : item.file.type === "image/webp" ? ["image/webp", "webp"] : ["image/png", "png"];
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, mime, 0.92));
    if (!blob) throw new Error("encode");
    return { blob, name: `${stem(item.file.name)}-hidden.${blob.type === mime ? ext : "png"}` };
  } finally {
    c.width = c.height = 0;
  }
}

export default function RedactTool() {
  const items = useRedactions();
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [effect, setEffect] = useState<Effect>("blur");
  const [strength, setStrength] = useState(7);
  const [scope, setScope] = useState<"one" | "all">("all");
  const toast = useToast();
  const job = useJob();
  const ids = useId();
  const current = items.find((i) => i.id === currentId) ?? items[0];
  const scanning = current && current.status !== "ready" && current.status !== "failed";
  const batch = scope === "all" ? items : current ? [current] : [];
  const label = batch.length === 1 ? "Save photo" : batch.length > 1 ? `Save ${batch.length} photos` : "Save";

  function save() {
    const list = batch.slice();
    if (!list.length) return;
    void job.run(
      async (signal, report) => {
        const files: { name: string; blob: Blob }[] = [];
        for (const [k, item] of list.entries()) {
          signal.throwIfAborted();
          files.push(await render(item, effect, strength));
          report((k + 1) / list.length, `photo ${k + 1} of ${list.length}`);
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
        downloadFile("hidden-photos.zip", zip, "application/zip");
        return `Saved ${plural(files.length, "photo")} in a ZIP (${formatBytes(zip.length)}).`;
      },
      () => "Couldn't save the photos.",
    );
  }

  return (
    <>
      <Step id="rd-add" number="01" label="Add" title="Add your photos">
        <DropZone
          accept={ACCEPT}
          buttonLabel="Add photos"
          wholePage
          onFiles={async (files, rejected) => {
            const problems = files.length ? await redactions.add(files) : [];
            if (rejected.length) problems.push(rejected.length === 1 ? `${rejected[0].name} isn't an image this tool can read.` : `${rejected.length} files weren't supported images.`);
            if (problems.length) toast(problems.join(" "), "error");
          }}
        >
          Faces, license plates and text are found by AI models running here, in the tab. Nothing is uploaded, unlike most online blur sites.
        </DropZone>
      </Step>

      <Step
        id="rd-choose"
        number="02"
        label="Choose"
        title="Choose what to hide"
        aside={<p className="hint">Each find gets a square. Click it to hide or show, drag to move, drag its corner to resize, × to remove. Drag on the photo to add one.</p>}
      >
        {items.length > 1 && (
          <ul className="strip" aria-label="Photos">
            {items.map((item) => (
              <li key={item.id} className={item.id === current?.id ? "current" : undefined}>
                <button type="button" aria-label={`Edit ${item.file.name}`} aria-current={item.id === current?.id} onClick={() => setCurrentId(item.id)}>
                  <Thumb item={item} />
                </button>
                <button type="button" className="drop" aria-label={`Remove ${item.file.name}`} onClick={() => redactions.remove(item.id)}>
                  <IconX size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {current ? (
          <>
            <div className="finds" aria-live="polite">
              {scanning || current.status === "failed" ? (
                <span className="status">
                  {STATUS[current.status]}
                  {current.status === "faces" && current.progress > 0 ? ` ${Math.round(current.progress * 100)}%...` : current.status === "faces" ? "..." : ""}
                </span>
              ) : null}
              {KINDS.map(({ kind, one, many }) => {
                const found = current.regions.filter((r) => r.kind === kind);
                if (!found.length) return null;
                const allOn = found.every((r) => r.on);
                return (
                  <button key={kind} type="button" className={`kind ${kind}`} aria-pressed={allOn} onClick={() => redactions.setKind(current.id, kind, !allOn)}>
                    <i aria-hidden="true" />
                    {found.length} {found.length === 1 ? one : many} · {allOn ? "hide all" : found.some((r) => r.on) ? "some hidden" : "shown"}
                  </button>
                );
              })}
              {!scanning && current.status === "ready" && current.regions.length === 0 && <span className="status">Nothing found. Drag on the photo to hide areas yourself.</span>}
              {items.length === 1 && (
                <button className="btn small ghost" type="button" onClick={() => redactions.remove(current.id)}>
                  Remove photo
                </button>
              )}
            </div>
            <Editor item={current} effect={effect} strength={strength} />
          </>
        ) : (
          <div className="empty">
            <b>No photos yet</b>
            <span>Add a photo. Faces get a square first; then you choose what to hide.</span>
          </div>
        )}
      </Step>

      <Step id="rd-save" number="03" label="Save" title="Save the safe copy">
        <OutputPanel job={job} actionLabel={label} onAction={save} disabled={!batch.length}>
          <fieldset>
            <legend className="field-label">Effect</legend>
            <div className="choices">
              <ChoiceCard name={`${ids}fx`} value="blur" current={effect} onPick={setEffect} title="Blur">
                <small>Soft and natural</small>
              </ChoiceCard>
              <ChoiceCard name={`${ids}fx`} value="pixelate" current={effect} onPick={setEffect} title="Pixelate">
                <small>Big blocks</small>
              </ChoiceCard>
              <ChoiceCard name={`${ids}fx`} value="box" current={effect} onPick={setEffect} title="Black box">
                <small>Covers completely</small>
              </ChoiceCard>
            </div>
          </fieldset>
          <div>
            <p className="field-label">Strength and scope</p>
            <div className="options">
              <label className="option">
                Strength
                <input type="range" min={1} max={10} value={strength} disabled={effect === "box"} aria-label="Strength" onChange={(e) => setStrength(Number(e.target.value))} />
              </label>
              {items.length > 1 && (
                <label className="option">
                  Save
                  <select value={scope} aria-label="Which photos to save" onChange={(e) => setScope(e.target.value as "one" | "all")}>
                    <option value="all">All {items.length} photos</option>
                    <option value="one">Only this photo</option>
                  </select>
                </label>
              )}
            </div>
            <p className="note">
              Blur and pixelate throw the detail away, so the original can't be restored from the saved copy. Hidden data such as GPS location is removed too.
              Check the photo before sharing: no detector catches everything.
            </p>
          </div>
        </OutputPanel>
      </Step>
    </>
  );
}

/** A small preview of a photo for the strip. */
function Thumb({ item }: { item: RedactItem }) {
  return (
    <canvas
      ref={(c) => {
        if (!c || c.width === 120) return;
        c.width = 120;
        c.height = Math.round((120 * item.bitmap.height) / item.bitmap.width);
        c.getContext("2d")!.drawImage(item.bitmap, 0, 0, c.width, c.height);
      }}
      aria-hidden="true"
    />
  );
}
