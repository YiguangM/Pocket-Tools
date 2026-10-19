import { backgroundTool } from "./background";
import { imagesTool } from "./images";
import { pdfTool } from "./pdf";
import { redactTool } from "./redact";
import type { ToolDefinition } from "./types";
import { upscaleTool } from "./upscale";

/** Every tool the app offers, in home-screen order. To add one, create its folder and list it here. */
export const tools: readonly ToolDefinition[] = [pdfTool, imagesTool, redactTool, backgroundTool, upscaleTool];
