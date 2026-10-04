/* Copyright 2026 Marimo. All rights reserved. */

import type { EditorView } from "@codemirror/view";
import { ensureCellEditorView } from "@/core/cells/cells";
import { CellId } from "@/core/cells/ids";
import { setHelixMode } from "@/core/codemirror/keymaps/helix";
import type { KeymapConfig } from "@/core/config/config-schema";
import { logNever } from "@/utils/assertNever";
import { retryWithTimeout } from "@/utils/timeout";

/**
 * Handlers shared by the focus/selection keymap, reused by preset-specific
 * command-mode tables below so they don't duplicate the focus logic.
 */
export interface CommandModeFocusHandlers {
  ArrowUp: () => boolean;
  ArrowDown: () => boolean;
  ArrowLeft: () => boolean;
  ArrowRight: () => boolean;
  Enter: () => boolean;
  "Shift+ArrowUp": () => boolean;
  "Shift+ArrowDown": () => boolean;
  "Mod+ArrowUp": () => boolean;
  "Mod+ArrowDown": () => boolean;
}

export interface CommandModeKeymapHandlers {
  focus: CommandModeFocusHandlers;
  cellId: CellId;
  selectedCells: ReadonlySet<CellId>;
  /** Whether Helix select mode is active. */
  selectMode: boolean;
  /** Enters select mode (selecting the focused cell if needed) or leaves it, keeping the selection. */
  toggleSelectMode: () => boolean;
  /** Leaves select mode, keeping the selection. */
  exitSelectMode: () => void;
  deleteCell: () => boolean;
  /** Copies the focused cell (or selection) to the clipboard, then deletes it immediately, refusing on a running or queued cell. */
  deleteCellWithClipboardCopy: () => boolean;
  /** Moves the cells, given in column order, up one position as a unit, refusing at the column edge. */
  moveCellsUp: (cellIds: CellId[]) => boolean;
  /** Moves the cells, given in column order, down one position as a unit, refusing at the column edge. */
  moveCellsDown: (cellIds: CellId[]) => boolean;
  copyCells: (cellIds: CellId[]) => void;
  pasteAtCell: (cellId: CellId, opts?: { before?: boolean }) => void;
  createNewCell: (opts: {
    cellId: CellId;
    before: boolean;
    autoFocus: boolean;
    newCellId?: CellId;
  }) => void;
  undoDeleteCell: () => void;
  /** Like `focus.Enter`, but opens a Helix editor in insert mode. */
  focusEditorInInsertMode: () => boolean;
}

/** A table dispatched through {@link handleVimKeybinding}. */
export type CommandModeKeySequenceTable = Record<string, () => boolean>;

function getVimCommandModeTable(
  handlers: CommandModeKeymapHandlers,
): CommandModeKeySequenceTable {
  const { focus, cellId, selectedCells, deleteCell, copyCells, pasteAtCell } =
    handlers;
  return {
    j: focus.ArrowDown,
    k: focus.ArrowUp,
    h: focus.ArrowLeft,
    l: focus.ArrowRight,
    i: focus.Enter,
    "shift+j": focus["Shift+ArrowDown"],
    "shift+k": focus["Shift+ArrowUp"],
    "g g": focus["Mod+ArrowUp"],
    "shift+g": focus["Mod+ArrowDown"],
    "d d": deleteCell,
    "y y": () => {
      copyCells(selectedCells.size >= 2 ? [...selectedCells] : [cellId]);
      return true;
    },
    p: () => {
      pasteAtCell(cellId, { before: false });
      return true;
    },
    "shift+p": () => {
      pasteAtCell(cellId, { before: true });
      return true;
    },
    o: () => {
      handlers.createNewCell({ cellId, before: false, autoFocus: true });
      return true;
    },
    "shift+o": () => {
      handlers.createNewCell({ cellId, before: true, autoFocus: true });
      return true;
    },
    u: () => {
      handlers.undoDeleteCell();
      return true;
    },
  };
}

function getHelixCommandModeTable(
  handlers: CommandModeKeymapHandlers,
): CommandModeKeySequenceTable {
  const { focus, cellId, selectedCells, selectMode, copyCells, pasteAtCell } =
    handlers;
  // The cell selection is kept in column order, so it moves and copies as a unit.
  const targetCells = selectedCells.size >= 2 ? [...selectedCells] : [cellId];
  // Autofocus keeps cell-level focus when a cell is created from command mode,
  // so open the new cell's editor in insert mode, like Helix's `o`/`O`. The
  // cell renders, then builds and attaches its editor, over the next frames.
  const openNewCell = (before: boolean) => {
    const newCellId = CellId.create();
    handlers.createNewCell({ cellId, before, autoFocus: true, newCellId });
    let view: EditorView | null | undefined;
    retryWithTimeout(
      () => {
        if (!view) {
          view = ensureCellEditorView(newCellId);
          if (view) {
            setHelixMode(view, "insert");
          }
        }
        view?.focus();
        return view?.hasFocus ?? false;
      },
      { retries: 10, delay: 20 },
    );
    return true;
  };
  return {
    j: selectMode ? focus["Shift+ArrowDown"] : focus.ArrowDown,
    k: selectMode ? focus["Shift+ArrowUp"] : focus.ArrowUp,
    h: focus.ArrowLeft,
    l: focus.ArrowRight,
    "g g": focus["Mod+ArrowUp"],
    "shift+g": focus["Mod+ArrowDown"],
    x: focus["Shift+ArrowDown"],
    "shift+x": focus["Shift+ArrowUp"],
    v: handlers.toggleSelectMode,
    // The cell selection stays on the moved cells, so repeated presses keep
    // moving the same cells.
    "shift+j": () => handlers.moveCellsDown(targetCells),
    "shift+k": () => handlers.moveCellsUp(targetCells),
    // A consumed selection leaves select mode, like Helix's `d` and `y`.
    d: () => {
      if (!handlers.deleteCellWithClipboardCopy()) {
        return false;
      }
      handlers.exitSelectMode();
      return true;
    },
    y: () => {
      copyCells(targetCells);
      handlers.exitSelectMode();
      return true;
    },
    p: () => {
      pasteAtCell(cellId, { before: false });
      return true;
    },
    "shift+p": () => {
      pasteAtCell(cellId, { before: true });
      return true;
    },
    u: () => {
      handlers.undoDeleteCell();
      return true;
    },
    i: handlers.focusEditorInInsertMode,
    o: () => openNewCell(false),
    "shift+o": () => openNewCell(true),
  };
}

/**
 * Returns the preset's command-mode key-sequence table, or undefined for
 * presets (such as `default`) that don't have one.
 */
export function getCommandModeKeySequenceTable(
  preset: KeymapConfig["preset"],
  handlers: CommandModeKeymapHandlers,
): CommandModeKeySequenceTable | undefined {
  switch (preset) {
    case "vim":
      return getVimCommandModeTable(handlers);
    case "helix":
      return getHelixCommandModeTable(handlers);
    case "default":
      return undefined;
    default:
      logNever(preset);
      return undefined;
  }
}
