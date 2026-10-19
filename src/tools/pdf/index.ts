import { lazy } from "react";
import type { ToolDefinition } from "../types";
import { PdfIcon } from "./PdfIcon";

export const pdfTool: ToolDefinition = {
  id: "pdf",
  name: "PDF toolbox",
  description: "Merge, reorder, rotate, split and shrink PDFs, or turn pages into images.",
  icon: PdfIcon,
  route: "/pdf",
  component: lazy(() => import("./PdfTool")),
};
