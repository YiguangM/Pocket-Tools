import { zipSync } from "fflate";
import { useId, useState } from "react";
import { downloadFile } from "../../shared/lib/download";
import { formatBytes, plural } from "../../shared/lib/format";
import { ChoiceCard } from "../../shared/ui/ChoiceCard";
import { OutputPanel, useJob } from "../../shared/ui/OutputPanel";
import type { PageImage, PageSize } from "./combine";
import { convertImage, type ImageItem } from "./convert";
import { outputName, uniqueNames, type OutFormat, type Resize } from "./output";

type Target = OutFormat | "pdf";
type ResizeMode = Resize["mode"];

/** Inside a PDF: PNG where transparency may matter, JPEG for photos (pdf-lib can't embed WebP or AVIF). */
const pdfKind = (item: ImageItem): PageImage["kind"] => (/^image\/(png|gif|bmp)$/.test(item.file.type) ? "png" : "jpeg");

export function ConvertPanel({ items }: { items: ImageItem[] }) {
  const [target, setTarget] = useState<Target>("same");
  const [quality, setQuality] = useState(82);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("none");
  const [max, setMax] = useState("1600");
  const [percent, setPercent] = useState("50");
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const job = useJob();
  const ids = useId();

  const pdf = target === "pdf";
  const lossy =
    target === "jpeg" ||
    target === "webp" ||
    (target === "same" && items.some((i) => i.file.type === "image/jpeg" || i.file.type === "image/webp")) ||
    (pdf && items.some((i) => pdfKind(i) === "jpeg"));
  const resize: Resize = resizeMode === "fit" ? { mode: "fit", max: Number(max) } : resizeMode === "percent" ? { mode: "percent", percent: Number(percent) } : { mode: "none" };
  const label = pdf ? "Save PDF" : items.length === 1 ? "Save image" : items.length > 1 ? `Save ${items.length} images` : "Save images";

  function save() {
    if (!items.length) return;
    const batch = items.slice(); // edits made while saving don't change this run
    const before = formatBytes(batch.reduce((sum, i) => sum + i.file.size, 0));
    let current = "";
    void job.run(
      async (signal, report) => {
        const converted = [];
        for (const [k, item] of batch.entries()) {
          signal.throwIfAborted();
          current = item.file.name;
          const out = await convertImage(item, { format: pdf ? pdfKind(item) : (target as OutFormat), quality, resize });
          converted.push({ item, ...out });
          report(((k + 1) / batch.length) * (pdf ? 0.9 : 1), `image ${k + 1} of ${batch.length}`);
        }
        signal.throwIfAborted();

        if (pdf) {
          current = "";
          report(0.95, "building the PDF");
          const { imagesToPdf } = await import("./combine"); // pdf-lib loads only when a PDF is made
          const pages: PageImage[] = [];
          for (const c of converted) pages.push({ data: new Uint8Array(await c.blob.arrayBuffer()), kind: pdfKind(c.item), width: c.width, height: c.height });
          const data = await imagesToPdf(pages, pageSize, signal);
          const name = batch.length === 1 ? outputName(batch[0].file.name, "pdf") : "combined-images.pdf";
          downloadFile(name, data, "application/pdf");
          return `Saved ${name}: ${plural(pages.length, "page")} (${formatBytes(data.length)}), from ${before}.`;
        }

        const names = uniqueNames(converted.map((c) => outputName(c.item.file.name, c.ext)));
        if (converted.length === 1) {
          downloadFile(names[0], converted[0].blob);
          return `Saved ${names[0]} (${formatBytes(converted[0].blob.size)}), from ${before}.`;
        }
        const files: Record<string, Uint8Array> = {};
        for (const [k, c] of converted.entries()) files[names[k]] = new Uint8Array(await c.blob.arrayBuffer());
        const zip = zipSync(files, { level: 0 }); // images are already compressed
        downloadFile("converted-images.zip", zip, "application/zip");
        return `Saved ${plural(converted.length, "image")} in a ZIP (${formatBytes(zip.length)}), from ${before}.`;
      },
      (e) =>
        e instanceof Error && /can't save/.test(e.message)
          ? e.message
          : current
            ? `Couldn't convert ${current}.`
            : pdf
              ? "Couldn't build the PDF."
              : "Couldn't convert the images.",
    );
  }

  return (
    <OutputPanel job={job} actionLabel={label} onAction={save} disabled={!items.length}>
      <fieldset>
        <legend className="field-label">Format</legend>
        <div className="choices">
          <ChoiceCard name={`${ids}format`} value="same" current={target} onPick={setTarget} title="Keep format">
            <small>Same type as each original</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}format`} value="jpeg" current={target} onPick={setTarget} title="JPG">
            <small>Photos; works everywhere</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}format`} value="png" current={target} onPick={setTarget} title="PNG">
            <small>Sharp edges, transparency</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}format`} value="webp" current={target} onPick={setTarget} title="WebP">
            <small>Smallest files for the web</small>
          </ChoiceCard>
          <ChoiceCard name={`${ids}format`} value="pdf" current={target} onPick={setTarget} title="One PDF">
            <small>Combine all images, one per page, in the order above</small>
          </ChoiceCard>
        </div>
      </fieldset>

      <div>
        <p className="field-label">Size</p>
        <div className="options">
          {pdf && (
            <label className="option">
              Page
              <select value={pageSize} aria-label="Page size" onChange={(e) => setPageSize(e.target.value as PageSize)}>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
                <option value="fit">Fit each image</option>
              </select>
            </label>
          )}
          <label className="option">
            Quality
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={quality}
              disabled={!lossy}
              aria-label="Quality"
              aria-valuetext={`${quality} percent`}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
            <span className="value">{lossy ? `${quality}%` : "lossless"}</span>
          </label>
          <label className="option">
            Resize
            <select value={resizeMode} aria-label="Resize" onChange={(e) => setResizeMode(e.target.value as ResizeMode)}>
              <option value="none">Keep size</option>
              <option value="fit">Fit within</option>
              <option value="percent">Scale to</option>
            </select>
          </label>
          {resizeMode === "fit" && (
            <label className="option">
              <input type="number" min={16} value={max} aria-label="Longest side in pixels" onChange={(e) => setMax(e.target.value)} /> px on the longest side
            </label>
          )}
          {resizeMode === "percent" && (
            <label className="option">
              <input type="number" min={1} max={100} value={percent} aria-label="Scale percent" onChange={(e) => setPercent(e.target.value)} /> %
            </label>
          )}
        </div>
        <p className="note">
          {pdf
            ? "Each image becomes one page, in the order shown above; use the arrows on the cards to change it. A4 and Letter pages turn sideways for wide images. Hidden data is removed and photos are turned upright."
            : "Every saved image is redrawn, so hidden data (location, camera, date, editing history) is removed. Photos are turned upright first. Images are never made larger."}
        </p>
      </div>
    </OutputPanel>
  );
}
