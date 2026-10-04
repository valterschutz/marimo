/* Copyright 2026 Marimo. All rights reserved. */
import { getSessionId } from "@/core/kernel/session";
import { asURL } from "./url";

/**
 * Open a notebook in a new tab.
 * @param path - The path to the notebook.
 */
export function openNotebook(path: string) {
  // There is no leading `/` in the path in order to work when marimo is at a subpath.
  window.open(asURL(`?file=${encodeURIComponent(path)}`).toString(), "_blank");
}

/**
 * The `target` for a link that opens a notebook from a listing page.
 *
 * In a browser, each notebook gets one named tab per session, so clicking it
 * again reuses that tab. Running as an app (installed, or Chromium's `--app`),
 * new windows would open as ordinary browser tabs, so stay in the app window.
 */
export function notebookLinkTarget(path: string): string {
  if (isRunningAsApp()) {
    return "_self";
  }
  return `${getSessionId()}-${encodeURIComponent(path)}`;
}

/** Whether marimo is running in its own app window rather than a browser tab. */
export function isRunningAsApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}
