import { useEffect } from "react";

export const APP_NAME = "Pocket Tools";

/** Sets the tab title to "<title> · Pocket Tools", or just the app name. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
