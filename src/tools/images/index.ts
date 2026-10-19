import { lazy } from "react";
import type { ToolDefinition } from "../types";
import { ImagesIcon } from "./ImagesIcon";

export const imagesTool: ToolDefinition = {
  id: "images",
  name: "Image converter",
  description: "Convert, shrink and resize images, and strip hidden data such as location.",
  icon: ImagesIcon,
  route: "/images",
  component: lazy(() => import("./ImagesTool")),
};
