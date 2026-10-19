import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { PRODUCER } from "./build";

type SampleSpec = { name: string; color: [number, number, number]; pages: { title: string; landscape?: boolean }[] };

export const SAMPLES: SampleSpec[] = [
  {
    name: "Lease agreement.pdf",
    color: [0.12, 0.25, 0.45],
    pages: [{ title: "Lease agreement" }, { title: "Terms and conditions" }, { title: "Signature page" }],
  },
  {
    name: "Receipts.pdf",
    color: [0.05, 0.42, 0.36],
    pages: [{ title: "Receipt: groceries" }, { title: "Receipt: transport", landscape: true }],
  },
];

/** Draws a small placeholder document locally, so people can try the tool without their own files. */
export async function makeSample(spec: SampleSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const label = spec.name.replace(/\.pdf$/i, "");
  spec.pages.forEach((sp, i) => {
    const [w, h] = sp.landscape ? [842, 595] : [595, 842];
    const page = doc.addPage([w, h]);
    page.drawRectangle({ x: 0, y: h - 90, width: w, height: 90, color: rgb(...spec.color) });
    page.drawText(sp.title, { x: 40, y: h - 58, size: 26, font: bold, color: rgb(1, 1, 1) });
    for (let k = 0; k < 14; k++) {
      const lineWidth = (w - 80) * (0.55 + ((k * 37 + i * 11) % 40) / 100);
      page.drawRectangle({ x: 40, y: h - 140 - k * 28, width: Math.min(lineWidth, w - 80), height: 8, color: rgb(0.82, 0.84, 0.87) });
    }
    page.drawText(`${label}  -  page ${i + 1}`, { x: 40, y: 30, size: 10, font: regular, color: rgb(0.4, 0.4, 0.45) });
  });
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  return doc.save();
}
