/* Copyright 2026 Marimo. All rights reserved. */

import useEvent from "react-use-event-hook";
import { UndoButton } from "@/components/buttons/undo-button";
import { toast } from "@/components/ui/use-toast";
import {
  hasOnlyOneCellAtom,
  notebookAtom,
  useCellActions,
} from "@/core/cells/cells";
import type { CellId } from "@/core/cells/ids";
import { useRequestClient } from "@/core/network/requests";
import { store } from "@/core/state/jotai";
import { focusCell, isAnyCellFocused } from "../navigation/focus-utils";

/**
 * Wraps `deleteCell` so that cell focus survives the delete: the cell that
 * takes over focus gets cell focus instead of editor focus.
 *
 * The next cell is focused only after the deleted cell has left the DOM, when
 * nothing has focus anymore, which reads as a delete from an editor. So cell
 * focus is handed over while the deleted cell still holds it.
 */
function useDeleteCellKeepingCellFocus() {
  const { deleteCell } = useCellActions();
  return (opts: { cellId: CellId }) => {
    const hadCellFocus = isAnyCellFocused();
    deleteCell(opts);
    const { scrollKey } = store.get(notebookAtom);
    if (hadCellFocus && scrollKey) {
      focusCell(scrollKey);
    }
  };
}

export function useDeleteCellCallback() {
  const { undoDeleteCell } = useCellActions();
  const deleteCell = useDeleteCellKeepingCellFocus();
  const { sendDeleteCell } = useRequestClient();

  return useEvent((opts: { cellId: CellId }) => {
    // Can't delete the last cell
    if (store.get(hasOnlyOneCellAtom)) {
      return;
    }

    const { cellId } = opts;
    const notebook = store.get(notebookAtom);
    const isEmptyCell = (notebook.cellData[cellId]?.code ?? "").trim() === "";

    // Optimistic update
    deleteCell({ cellId });
    sendDeleteCell({ cellId: cellId }).catch(() => {
      // Fall back on failure
      undoDeleteCell();
    });

    if (!isEmptyCell) {
      const { dismiss } = toast({
        title: "Cell deleted",
        description:
          "You can bring it back by clicking undo or through the command palette.",
        action: (
          <UndoButton
            data-testid="undo-delete-button"
            onClick={() => {
              undoDeleteCell();
              dismiss();
            }}
          />
        ),
      });
    }
  });
}

export function useDeleteManyCellsCallback() {
  const { undoDeleteCell } = useCellActions();
  const deleteCell = useDeleteCellKeepingCellFocus();
  const { sendDeleteCell } = useRequestClient();

  return useEvent(async (opts: { cellIds: CellId[] }) => {
    // Can't delete the last cell
    if (store.get(hasOnlyOneCellAtom)) {
      return;
    }

    const { cellIds } = opts;
    for (const cellId of cellIds) {
      await sendDeleteCell({ cellId }).then(() => {
        deleteCell({ cellId });
      });
    }

    const { dismiss } = toast({
      title: "Cells deleted",
      action: (
        <UndoButton
          data-testid="undo-delete-button"
          onClick={() => {
            for (const _cellId of cellIds) {
              // This function does not take a cellId,
              // so we just undo the number of cells that were deleted
              undoDeleteCell();
            }
            dismiss();
          }}
        />
      ),
    });
  });
}
