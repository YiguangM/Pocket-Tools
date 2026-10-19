import { lazy } from "react";
import type { ToolDefinition } from "../types";
import { BackgroundIcon } from "./BackgroundIcon";

export const backgroundTool: ToolDefinition = {
  id: "background",
  name: "Background remover",
  description: "Cut people, pets and products out of photos with an AI model that runs in the tab.",
  icon: BackgroundIcon,
  route: "/background",
  component: lazy(() => import("./BackgroundTool")),
};
