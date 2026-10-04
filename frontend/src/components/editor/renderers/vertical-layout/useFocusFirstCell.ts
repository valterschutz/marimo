/* Copyright 2026 Marimo. All rights reserved. */

import { focusCell } from "@/components/editor/navigation/focus-utils";
import { getNotebook } from "@/core/cells/cells";
import type { CellId } from "@/core/cells/ids";
import { useOnMount } from "@/hooks/useLifecycle";
import { extractCellNameFromHash } from "@/utils/cell-urls";
import { Logger } from "@/utils/Logger";

/**
 * Give the first cell cell focus (cell command mode), not editor focus.
 *
 * If the URL contains a /#scrollTo= hash, focus on that cell.
 * Otherwise, focus on the first cell.
 */
export function useFocusFirstCell() {
  useOnMount(() => {
    const delay = 100; // ms just so its not immediate

    const timeout = setTimeout(() => {
      // Let the DOM render
      requestAnimationFrame(() => {
        // Skip auto-focus if the document doesn't have focus to avoid
        // stealing focus from outside (e.g., when embedded in an iframe)
        if (!document.hasFocus()) {
          return;
        }

        // Check if the URL contains a scrollTo parameter
        const hash = window.location.hash;
        const cellName = extractCellNameFromHash(hash);

        if (cellName) {
          // If we have a scrollTo parameter, focus on that cell
          focusCellByName(cellName);
        } else {
          // Otherwise focus on the first cell
          try {
            focusFirstCell();
          } catch (error) {
            Logger.warn("Error focusing first cell", error);
          }
        }
      });
    }, delay);

    return () => clearTimeout(timeout);
    // Delay only when app is first loaded
  });
}

function focusFirstCell() {
  const { cellIds } = getNotebook();
  const [cellId] = cellIds.iterateTopLevelIds;
  if (cellId) {
    focusCell(cellId);
  }
}

let hasScrolledToCell = false;

/**
 * Focus the cell with the given name
 */
function focusCellByName(cellName: string) {
  // Only do this once per page load
  if (hasScrolledToCell) {
    return;
  }

  // Find the cell div with data-cell-name attribute matching the cellName
  const cellElement = document.querySelector(`[data-cell-name="${cellName}"]`);

  if (cellElement) {
    // Scroll the element into view
    cellElement.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    hasScrolledToCell = true;

    if (cellElement instanceof HTMLElement) {
      const cellId = extractCellIdFromDomElement(cellElement);

      if (!cellId) {
        Logger.error(`Missing cellId for cell with name ${cellName}`);
        return;
      }

      focusCell(cellId);
    }
  } else {
    Logger.warn(
      `Cannot focus cell with name ${cellName} because it was not found`,
    );
    // Fall back to focusing the first cell if cell not found
    focusFirstCell();
  }
}

function extractCellIdFromDomElement(
  cellElement: HTMLElement,
): CellId | undefined {
  const cellIdStr = cellElement.dataset.cellId ?? undefined;
  return cellIdStr as CellId | undefined;
}
