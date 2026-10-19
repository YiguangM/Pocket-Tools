import type { ComponentType } from "react";
import type { IconProps } from "../shared/ui/icons";

/**
 * What each tool exports from src/tools/<name>/index.ts. The app shell reads
 * only these fields: it lists tools on the home screen and renders
 * `component` at `route`, inside the shared page frame.
 *
 * Every tool follows the same privacy rule: no network, files stay in memory.
 */
export type ToolDefinition = {
  /** Stable, unique, kebab-case. */
  id: string;
  /** Page title and home-screen card title. */
  name: string;
  /** One sentence for the card and the tool page header. */
  description: string;
  icon: ComponentType<IconProps>;
  /** Absolute path such as "/pdf". */
  route: string;
  /** Usually React.lazy(), so each tool loads only when opened. */
  component: ComponentType;
};
