import { lazy } from "react";
import type { ToolDefinition } from "../types";
import { UpscaleIcon } from "./UpscaleIcon";

export const upscaleTool: ToolDefinition = {
  id: "upscale",
  name: "Image upscaler",
  description: "Make small or blurry images 2 or 4 times bigger with AI, right in the tab.",
  icon: UpscaleIcon,
  route: "/upscale",
  component: lazy(() => import("./UpscaleTool")),
};
