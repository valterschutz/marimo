/* Copyright 2026 Marimo. All rights reserved. */

import type { KeymapConfig } from "@/core/config/config-schema";
import { logNever } from "@/utils/assertNever";
import type { CellId } from "@/core/cells/ids";

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
  deleteCell: () => boolean;
  copyCells: (cellIds: CellId[]) => void;
  pasteAtCell: (cellId: CellId, opts?: { before?: boolean }) => void;
  createNewCell: (opts: {
    cellId: CellId;
    before: boolean;
    autoFocus: boolean;
  }) => void;
  undoDeleteCell: () => void;
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
    case "default":
    case "helix":
      return undefined;
    default:
      logNever(preset);
      return undefined;
  }
}
