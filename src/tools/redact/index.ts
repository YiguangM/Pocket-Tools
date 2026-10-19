import { lazy } from "react";
import type { ToolDefinition } from "../types";
import { RedactIcon } from "./RedactIcon";

export const redactTool: ToolDefinition = {
  id: "redact",
  name: "Face and plate blur",
  description: "Find faces, license plates and text in a photo, then blur or pixelate them before you share it.",
  icon: RedactIcon,
  route: "/redact",
  component: lazy(() => import("./RedactTool")),
};
