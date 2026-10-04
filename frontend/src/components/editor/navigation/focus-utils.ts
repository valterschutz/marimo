/* Copyright 2026 Marimo. All rights reserved. */

import type { createStore } from "jotai";
import { getCellEditorView } from "@/core/cells/cells";
import { type CellId, HTMLCellId } from "@/core/cells/ids";
import { Logger } from "@/utils/Logger";

export function focusCellEditor(
  store: ReturnType<typeof createStore>,
  cellId: CellId,
): void {
  const editor = getCellEditorView(cellId);
  if (editor) {
    editor.focus();
  } else {
    Logger.warn(
      `[CellFocusManager] focusCellEditor: element not found: ${cellId}`,
    );
  }
}

export function focusCell(cellId: CellId): void {
  const element = document.getElementById(HTMLCellId.create(cellId));
  if (element) {
    tryFocus(element);
  } else {
    Logger.warn(`[CellFocusManager] focusCell: element not found: ${cellId}`);
  }
}

/**
 * Run a callback after two frames.
 * It is somewhat common/safer to run code after two frames to ensure the DOM is fully rendered.
 */
export function raf2(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

/**
 * Checks if the cell is focused at the top level.
 */
export function isAnyCellFocused(): boolean {
  return (
    document.activeElement instanceof HTMLElement &&
    document.activeElement.classList.contains("marimo-cell")
  );
}

export function tryFocus(dom: HTMLElement) {
  try {
    dom.focus();
  } catch {
    Logger.warn("[CellFocusManager] element may not be focusable", dom);
  }
}

/**
 * Helix's default `scrolloff`: lines kept between an aligned target and the
 * edge of the window.
 */
export const SCROLLOFF_LINES = 5;

/** Where Helix's view mode puts its target in the window. */
export type ViewAlignment = "start" | "center" | "end";

/**
 * Scroll the notebook so the cell sits at the top, centre or bottom of the
 * window, like Helix's view mode does with the cursor line. A cell taller
 * than the window is put at the top instead of centred, so the start of its
 * code stays visible.
 */
export function alignCellInView(
  cellId: CellId,
  alignment: ViewAlignment,
): void {
  const element = document.getElementById(HTMLCellId.create(cellId));
  if (!element) {
    Logger.warn(
      `[CellFocusManager] alignCellInView: element not found: ${cellId}`,
    );
    return;
  }
  const isTallerThanWindow =
    element.offsetHeight > getScrollParent(element).clientHeight;
  // `scrollIntoView` takes no margin, but it honours the element's scroll
  // margin, which only matters for this one call. `lh` is in the cell's
  // lines.
  element.style.scrollMarginBlock = `${SCROLLOFF_LINES}lh`;
  element.scrollIntoView({
    block: alignment === "center" && isTallerThanWindow ? "start" : alignment,
  });
  element.style.scrollMarginBlock = "";
}

function getScrollParent(element: HTMLElement): Element {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
      return parent;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}
