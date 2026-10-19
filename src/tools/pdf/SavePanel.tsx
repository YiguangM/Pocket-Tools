import { useId, useState } from "react";
import { downloadFile } from "../../shared/lib/download";
import { plural } from "../../shared/lib/format";
import { ChoiceCard } from "../../shared/ui/ChoiceCard";
import { OutputPanel, useJob } from "../../shared/ui/OutputPanel";
import { Reveal } from "../../shared/ui/Reveal";
import { EncryptedSourceError } from "./build";
import { exportImages, exportPdf, exportSplit, type ExportPage } from "./exporters";
import type { LoadedDoc, PageRef } from "./model";
import { baseName, type SaveMode } from "./output";
import type { ImageType, Quality } from "./pdfjs";
import { parseRange } from "./range";

type Format = "pdf" | "images";

export function SavePanel({ pages, docs }: { pages: PageRef[]; docs: LoadedDoc[] }) {
  const [format, setFormat] = useState<Format>("pdf");
  const [mode, setMode] = useState<SaveMode>("all");
  const [range, setRange] = useState("1-2, end");
  const [splitN, setSplitN] = useState("2");
  const [compress, setCompress] = useState(false);
  const [quality, setQuality] = useState<Quality>("medium");
  const [imageType, setImageType] = useState<ImageType>("png");
  const [dpi, setDpi] = useState(150);
  const job = useJob();
  const ids = useId();

  const parsed = parseRange(range, pages.length);
  const rangeInfo = !pages.length ? "" : parsed.idx ? `${plural(parsed.idx.length, "page")} of ${pages.length}` : parsed.err;
  const chosen = mode === "range" ? (parsed.idx ?? []).map((i) => pages[i]) : mode === "selected" ? pages.filter((p) => p.sel) : pages;
  const blocked = !chosen.length || (mode === "range" && !!parsed.err);
  const label =
    format === "images"
      ? chosen.length === 1
        ? "Save image"
        : chosen.length > 1
          ? `Save ${chosen.length} images`
          : "Save images"
      : mode === "split"
        ? "Save ZIP"
        : "Save PDF";

  function pickFormat(next: Format) {
    setFormat(next);
    if (next === "images" && mode === "split") setMode("all"); // splitting only makes sense for PDFs
  }

  function save() {
    if (blocked) return;
    const byId = new Map(docs.map((d) => [d.id, d]));
    const list: ExportPage[] = chosen.map((p) => ({ doc: byId.get(p.docId)!, index: p.index, rot: p.rot }));
    const base = baseName(docs.map((d) => d.name));
    void job.run(
      async (signal, onProgress) => {
        const common = { base, signal, onProgress };
        const result =
          format === "images"
            ? await exportImages(list, { ...common, imageType, dpi })
            : mode === "split"
              ? await exportSplit(list, { ...common, size: Number(splitN), compress, quality })
              : await exportPdf(list, { ...common, mode, docs, compress, quality });
        downloadFile(result.filename, result.data, result.type);
        return `Saved ${result.summary}.`;
      },
      (e) =>
        e instanceof EncryptedSourceError
          ? `${e.docName} is encrypted, so its pages can't be copied as they are. Turn on Compress to save them as pictures.`
          : format === "images"
            ? "Couldn't make the images. One of the PDFs may be damaged."
            : compress
              ? "Couldn't build that file. One of the PDFs may be damaged."
              : "Couldn't build that file. One of the PDFs may be damaged; turning on Compress often gets around that.",
    );
  }

  return (
    <OutputPanel job={job} actionLabel={label} onAction={save} disabled={blocked}>
      <fieldset>
        <legend className="field-label">Save as</legend>
        <div className="choices">
          <ChoiceCard name={`${ids}format`} value="pdf" current={format} onPick={pickFormat} title="PDF">
            <small>One document; text stays selectable</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}format`} value="images" current={format} onPick={pickFormat} title="Images">
            <small>One PNG or JPG per page</small>
          </ChoiceCard>
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label">Which pages</legend>
        <div className="choices">
          <ChoiceCard name={`${ids}mode`} value="all" current={mode} onPick={setMode} title="All pages">
            <small>{format === "pdf" ? "Merge into one PDF" : "Every page in the grid"}</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}mode`} value="selected" current={mode} onPick={setMode} title="Selected pages">
            <small>Just what you ticked</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}mode`} value="range" current={mode} onPick={setMode} title="Page range">
            <small>
              <input
                type="text"
                value={range}
                spellCheck={false}
                autoComplete="off"
                aria-label="Page range"
                aria-describedby={`${ids}range`}
                placeholder="1-3, 7, 10-end"
                onFocus={() => setMode("range")}
                onChange={(e) => setRange(e.target.value)}
              />
            </small>
            <small id={`${ids}range`} className={"range-info" + (pages.length && parsed.err ? " err" : "")}>
              {rangeInfo}
            </small>
          </ChoiceCard>
          {format === "pdf" && (
            <ChoiceCard name={`${ids}mode`} value="split" current={mode} onPick={setMode} title="Split">
              <small>
                Every{" "}
                <input type="number" min={1} value={splitN} aria-label="Pages per file" onFocus={() => setMode("split")} onChange={(e) => setSplitN(e.target.value)} />{" "}
                pages, as a .zip
              </small>
            </ChoiceCard>
          )}
        </div>
      </fieldset>

      {format === "pdf" ? (
        <div key="pdf-size">
          <p className="field-label">Size</p>
          <div className="options">
            <label className="switch">
              <input type="checkbox" role="switch" checked={compress} onChange={(e) => setCompress(e.target.checked)} /> Compress
            </label>
            <label className="option">
              Quality
              <select value={quality} disabled={!compress} aria-label="Compression quality" onChange={(e) => setQuality(e.target.value as Quality)}>
                <option value="high">High (sharp, bigger)</option>
                <option value="medium">Medium</option>
                <option value="low">Low (smallest)</option>
              </select>
            </label>
          </div>
          <Reveal as="p" className="note" split="lines" playOnScroll>
            Compress turns each page into a picture. The file shrinks, but text can no longer be selected or searched.
          </Reveal>
        </div>
      ) : (
        <div key="image-options">
          <p className="field-label">Image</p>
          <div className="options">
            <label className="option">
              Format
              <select value={imageType} aria-label="Image format" onChange={(e) => setImageType(e.target.value as ImageType)}>
                <option value="png">PNG (sharpest)</option>
                <option value="jpeg">JPG (smaller files)</option>
              </select>
            </label>
            <label className="option">
              Resolution
              <select value={dpi} aria-label="Image resolution" onChange={(e) => setDpi(Number(e.target.value))}>
                <option value={72}>72 dpi (screen)</option>
                <option value={150}>150 dpi (standard)</option>
                <option value={300}>300 dpi (print)</option>
              </select>
            </label>
          </div>
          <p className="note">Each page becomes one image, with your rotations applied. Several pages download together as a .zip.</p>
        </div>
      )}
    </OutputPanel>
  );
}
