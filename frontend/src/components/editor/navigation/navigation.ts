/* Copyright 2026 Marimo. All rights reserved. */

import { closeCompletion, completionStatus } from "@codemirror/autocomplete";
import { simplifySelection } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import {
  setSignatureHelpTooltip,
  signatureHelpTooltipField,
} from "@marimo-team/codemirror-languageserver";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useMemo } from "react";
import { mergeProps, useFocusWithin, useKeyboard } from "react-aria";
import { DATA_FOR_CELL_ID } from "@/components/data-table/cell-utils";
import { aiCompletionCellAtom } from "@/core/ai/state";
import { maybeAddMarimoImport } from "@/core/cells/add-missing-import";
import {
  cellIdsAtom,
  ensureCellEditorView,
  notebookAtom,
  useCellActions,
} from "@/core/cells/cells";
import { useCellFocusActions } from "@/core/cells/focus";
import { CellId, HTMLCellId, SETUP_CELL_ID } from "@/core/cells/ids";
import {
  clearPendingCutAtom,
  pendingCutCellIdsAtom,
} from "@/core/cells/pending-cut-service";
import { usePendingDeleteService } from "@/core/cells/pending-delete-service";
import { scrollCellIntoView } from "@/core/cells/scrollCellIntoView";
import {
  closeSignatureHint,
  signatureHintField,
} from "@/core/codemirror/completion/signature-hint";
import {
  isInHelixNormalMode,
  setHelixMode,
} from "@/core/codemirror/keymaps/helix";
import {
  convertCellToMarkdown,
  getCurrentLanguageAdapter,
} from "@/core/codemirror/language/commands";
import { toggleMarkdown, toggleSQL } from "@/core/codemirror/extensions";
import { switchLanguage } from "@/core/codemirror/language/extension";
import { LanguageAdapters } from "@/core/codemirror/language/LanguageAdapters";
import {
  autoInstantiateAtom,
  hotkeysAtom,
  isAiFeatureEnabled,
  keymapPresetAtom,
  userConfigAtom,
} from "@/core/config/config";
import { useRegisteredActions } from "@/core/hotkeys/actions";
import type { HotkeyAction } from "@/core/hotkeys/hotkeys";
import { parseShortcut } from "@/core/hotkeys/shortcuts";
import { useRequestClient } from "@/core/network/requests";
import { useSaveNotebook } from "@/core/saving/save-component";
import { Events } from "@/utils/events";
import type { CollapsibleTree } from "@/utils/id-tree";
import { retryWithTimeout } from "@/utils/timeout";
import type { CellActionsDropdownHandle } from "../cell/cell-actions";
import { useDeleteManyCellsCallback } from "../cell/useDeleteCell";
import { useRunCells } from "../cell/useRunCells";
import { useCellClipboard } from "./clipboard";
import { handleCellCommandBindings } from "./cell-command-bindings";
import {
  alignCellInView,
  focusCell,
  focusCellEditor,
  raf2,
  type ViewAlignment,
} from "./focus-utils";
import {
  getIsSelectMode,
  getSelectedCells,
  useCellSelectionActions,
  useIsCellSelected,
  useIsSelectMode,
} from "./selection";
import { useTemporarilyShownCodeActions } from "./state";

interface HotkeyHandler {
  handle: (cellId: CellId) => boolean;
  bulkHandle: (cellIds: CellId[]) => boolean;
}

/**
 * Wraps a hotkey handler to support bulk handling.
 * If a handler fails mid-way, the bulk handling will stop.
 *
 * Use this utility if the bulk handler is the same as handling each cell individually.
 */
function addBulkHandler(handler: HotkeyHandler["handle"]): HotkeyHandler {
  return {
    handle: (cellId) => {
      return handler(cellId);
    },
    bulkHandle: (cellIds) => {
      let success = true;
      try {
        for (const cellId of cellIds) {
          success = success && handler(cellId);
        }
        return success;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Wraps a bulk handler to support single-cell handling.
 *
 * Use this utility if the single-cell handler is the same as a single-cell bulk handler.
 */
function addSingleHandler(handler: HotkeyHandler["bulkHandle"]): HotkeyHandler {
  return {
    handle: (cellId) => {
      return handler([cellId]);
    },
    bulkHandle: (cellIds) => {
      return handler(cellIds);
    },
  };
}

function useCellFocusProps(
  cellId: CellId,
  editorView: React.RefObject<EditorView | null>,
) {
  const focusActions = useCellFocusActions();
  const temporarilyShownCodeActions = useTemporarilyShownCodeActions();

  // This occurs at the cell level and descedants.
  const { focusWithinProps } = useFocusWithin({
    onFocusWithin: () => {
      // On focus, set the last focused cell id.
      focusActions.focusCell({ cellId });
    },
    onBlurWithin: (e) => {
      // Check if blur is happening because of vim search panel interaction
      if (isInVimPanel(e.relatedTarget) || isInVimPanel(e.target)) {
        // Don't hide code if we're just interacting with vim search
        return;
      }

      // If the related target is for a cell id (data-for-cell-id), then we don't want to hide the code, otherwise it might
      // close the dropdown.
      if (
        getDataForCellId(e.relatedTarget) === cellId ||
        getDataForCellId(e.relatedTarget?.closest(`[${DATA_FOR_CELL_ID}]`)) ===
          cellId
      ) {
        return;
      }

      // On blur, hide the code if it was temporarily shown.
      temporarilyShownCodeActions.remove(cellId);
      focusActions.blurCell();
      // Close signature help when clicking outside the cell
      if (editorView.current) {
        closeSignatureHelp(editorView.current);
      }
    },
  });

  return focusWithinProps;
}

function isInVimPanel(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (element instanceof HTMLElement) {
    return element.closest(".cm-vim-panel") !== null;
  }
  return false;
}

function getDataForCellId(element: Element | null | undefined): CellId | null {
  if (!element) {
    return null;
  }
  const cellId = element.getAttribute(DATA_FOR_CELL_ID);
  if (!cellId) {
    return null;
  }
  return cellId as CellId;
}

/**
 * Props for cell keyboard navigation,
 * to manage focus and selection.
 *
 * Handles both keyboard and mouse navigation.
 *
 * Includes some relevant Jupyter command mode:
 * https://jupyter-notebook.readthedocs.io/en/stable/examples/Notebook/Notebook%20Basics.html#Keyboard-Navigation
 */
export function useCellNavigationProps(
  cellId: CellId,
  {
    canMoveX,
    editorView,
    cellActionDropdownRef,
  }: {
    canMoveX: boolean;
    editorView: React.RefObject<EditorView | null>;
    cellActionDropdownRef: React.RefObject<CellActionsDropdownHandle | null>;
  },
) {
  const { saveOrNameNotebook } = useSaveNotebook();
  const { saveCellConfig } = useRequestClient();
  const setAiCompletionCell = useSetAtom(aiCompletionCellAtom);
  const actions = useCellActions();
  const store = useStore();
  const temporarilyShownCodeActions = useTemporarilyShownCodeActions();
  const runCells = useRunCells();
  const keymapPreset = useAtomValue(keymapPresetAtom);
  const { copyCells, pasteAtCell, cutCells } = useCellClipboard();
  const rawSelectionActions = useCellSelectionActions();
  const isSelected = useIsCellSelected(cellId);
  const isSelectMode = useIsSelectMode();
  const pendingDeleteService = usePendingDeleteService();
  const deleteCells = useDeleteManyCellsCallback();
  const userConfig = useAtomValue(userConfigAtom);
  const aiFeaturesEnabled = isAiFeatureEnabled(userConfig);
  const autoInstantiate = useAtomValue(autoInstantiateAtom);

  // Wrap selection actions to clear pending cells on any selection change
  const selectionActions = {
    clear: () => {
      pendingDeleteService.clear();
      rawSelectionActions.clear();
    },
    extend: (args: Parameters<typeof rawSelectionActions.extend>[0]) => {
      pendingDeleteService.clear();
      rawSelectionActions.extend(args);
    },
    select: (args: Parameters<typeof rawSelectionActions.select>[0]) => {
      pendingDeleteService.clear();
      rawSelectionActions.select(args);
    },
    setSelectMode: rawSelectionActions.setSelectMode,
  };

  const hotkeys = useAtomValue(hotkeysAtom);
  const registeredActions = useRegisteredActions();

  // Callbacks occur at the cell level and descedants.
  const focusWithinProps = useCellFocusProps(cellId, editorView);

  const { keyboardProps } = useKeyboard({
    onKeyDown: (evt) => {
      // Event came from an input, do nothing.
      if (Events.fromInput(evt)) {
        evt.continuePropagation();
        return;
      }

      const focusEditor = (helixMode: "normal" | "insert") => {
        temporarilyShownCodeActions.add(cellId);
        focusCellEditor(store, cellId);
        if (keymapPreset === "helix" && editorView.current) {
          setHelixMode(editorView.current, helixMode);
        }
        selectionActions.clear();
        return true;
      };

      // Selects this cell and the one focus moves to, then moves focus there.
      const extendSelection = (where: "before" | "after") => {
        const allCellIds = store.get(cellIdsAtom);
        selectionActions.extend({ cellId, allCellIds });
        const column = allCellIds.findWithId(cellId);
        const nextCellId =
          where === "before" ? column.before(cellId) : column.after(cellId);
        if (nextCellId) {
          selectionActions.extend({ cellId: nextCellId, allCellIds });
        }
        actions.focusCell({ cellId, where });
        return true;
      };

      // Cell select mode extends the selection instead of moving focus.
      const moveFocus = (where: "before" | "after") => {
        if (getIsSelectMode(store)) {
          return extendSelection(where);
        }
        actions.focusCell({ cellId, where });
        selectionActions.clear();
        return true;
      };

      const moveFocusAcrossColumns = (offset: -1 | 1) => {
        if (!canMoveX) {
          return false;
        }
        const notebook = store.get(notebookAtom);
        const column = notebook.cellIds.findWithId(cellId);
        const columnIndex = notebook.cellIds.indexOf(column);
        const adjacentColumn = notebook.cellIds.at(columnIndex + offset);
        if (!adjacentColumn || adjacentColumn.length === 0) {
          return false;
        }
        const adjacentCellId = findClosestAdjacentCell(cellId, adjacentColumn);
        actions.focusCell({ cellId: adjacentCellId, where: "exact" });
        selectionActions.clear();
        return true;
      };

      // Autofocus keeps cell focus when a cell is created from cell command
      // mode, so open the new cell's editor, in editor insert mode under
      // Helix like its `o`/`O`. The cell renders, then builds and attaches
      // its editor, over the next frames.
      const openNewCell = (before: boolean) => {
        const newCellId = CellId.create();
        actions.createNewCell({ cellId, before, autoFocus: true, newCellId });
        let view: EditorView | null | undefined;
        retryWithTimeout(
          () => {
            if (!view) {
              view = ensureCellEditorView(newCellId);
              if (view && keymapPreset === "helix") {
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

      // Helix's view mode, applied to the focused cell instead of a line.
      const alignCell = (alignment: ViewAlignment) => {
        alignCellInView(cellId, alignment);
        return true;
      };

      const selectedCells = getSelectedCells(store);

      // Cell ids targeted by a delete, or null if any of them is running or
      // queued and the delete must be refused.
      const getCellIdsToDelete = (): CellId[] | null => {
        const cellIds = selectedCells.size >= 2 ? [...selectedCells] : [cellId];
        const notebook = store.get(notebookAtom);
        const hasRunningCell = cellIds.some((id) => {
          const { status } = notebook.cellRuntime[id];
          return status === "running" || status === "queued";
        });
        return hasRunningCell ? null : cellIds;
      };

      // Handlers for the actions this cell runs
      const shortcuts: Partial<
        Record<HotkeyAction, HotkeyHandler["handle"] | HotkeyHandler>
      > = {
        // Navigation
        "cell.focusUp": () => moveFocus("before"),
        "cell.focusDown": () => moveFocus("after"),
        "command.focusLeft": () => moveFocusAcrossColumns(-1),
        "command.focusRight": () => moveFocusAcrossColumns(1),
        "global.focusTop": () => {
          actions.focusTopCell();
          selectionActions.clear();
          return true;
        },
        "global.focusBottom": () => {
          actions.focusBottomCell();
          selectionActions.clear();
          return true;
        },
        "command.alignCenter": () => alignCell("center"),
        "command.alignTop": () => alignCell("start"),
        "command.alignBottom": () => alignCell("end"),
        "command.focusEditor": () => focusEditor("normal"),
        "command.focusEditorInsertMode": () => focusEditor("insert"),

        // Selection
        "command.extendSelectionUp": () => extendSelection("before"),
        "command.extendSelectionDown": () => extendSelection("after"),
        "command.toggleSelectMode": () => {
          if (getIsSelectMode(store)) {
            selectionActions.setSelectMode({ selectMode: false });
            return true;
          }
          // Cell select mode always shows its ring on at least the focused cell.
          if (!selectedCells.has(cellId)) {
            selectionActions.select({ cellId });
          }
          selectionActions.setSelectMode({ selectMode: true });
          return true;
        },
        "command.clearSelection": () => {
          // Clear pending cut state if any
          const pendingCutCellIds = store.get(pendingCutCellIdsAtom);
          if (pendingCutCellIds.size > 0) {
            store.set(clearPendingCutAtom);
            return true;
          }
          // Also leaves cell select mode when this cell isn't selected.
          if (isSelected || getIsSelectMode(store)) {
            selectionActions.clear();
            return true;
          }
          return false;
        },

        "global.save": () => {
          saveOrNameNotebook();
          return true;
        },

        // Cell actions
        "cell.run": addSingleHandler((cellIds) => {
          runCells(cellIds);
          return true;
        }),
        "cell.runAndNewBelow": addSingleHandler((cellIds) => {
          runCells(cellIds);
          const lastCellId = cellIds[cellIds.length - 1];
          actions.moveToNextCell({ cellId: lastCellId, before: false });
          return true;
        }),
        "cell.runAndNewAbove": addSingleHandler((cellIds) => {
          runCells(cellIds);
          const firstCellId = cellIds[0];
          actions.moveToNextCell({ cellId: firstCellId, before: true });
          return true;
        }),
        "cell.createAbove": (cellId) => {
          actions.createNewCell({ cellId, before: true });
          return true;
        },
        "cell.createBelow": (cellId) => {
          actions.createNewCell({ cellId, before: false });
          return true;
        },
        "cell.moveUp": addSingleHandler((cellIds) => {
          // If moving up, make sure the first cell is not at the top of the notebook
          const firstCellId = cellIds[0];
          const notebook = store.get(notebookAtom);
          const isFirst =
            notebook.cellIds.findWithId(firstCellId).first() === firstCellId;
          if (isFirst) {
            return false;
          }

          cellIds.forEach((cellId) => {
            actions.moveCell({ cellId, before: true });
          });
          return true;
        }),
        "cell.moveDown": addSingleHandler((cellIds) => {
          // If moving down, make sure the last cell is not at the bottom of the notebook
          const lastCellId = cellIds[cellIds.length - 1];
          const notebook = store.get(notebookAtom);
          const isLast =
            notebook.cellIds.findWithId(lastCellId).last() === lastCellId;
          if (isLast) {
            return false;
          }

          // Move cells in the appropriate order to maintain relative positions
          cellIds.toReversed().forEach((cellId) => {
            actions.moveCell({ cellId, before: false });
          });
          return true;
        }),
        "cell.moveLeft": addBulkHandler((cellId) => {
          if (canMoveX) {
            actions.moveCell({ cellId, direction: "left" });
            return true;
          }
          return false;
        }),
        "cell.moveRight": addBulkHandler((cellId) => {
          if (canMoveX) {
            actions.moveCell({ cellId, direction: "right" });
            return true;
          }
          return false;
        }),
        "cell.hideCode": addSingleHandler((cellIds) => {
          // Get the cell configs
          const cellConfigs = cellIds.map((cellId) => {
            const cellConfig = store.get(notebookAtom).cellData[cellId]?.config;
            if (!cellConfig) {
              return null;
            }
            return cellConfig;
          });

          // Toggle to the same value for all cells
          const nextHideCode = !cellConfigs.every(
            (config) => config?.hide_code,
          );

          // Fire-and-forget
          void saveCellConfig({
            configs: Object.fromEntries(
              cellIds.map((cellId) => [cellId, { hide_code: nextHideCode }]),
            ),
          });

          for (const cellId of cellIds) {
            actions.updateCellConfig({
              cellId,
              config: { hide_code: nextHideCode },
            });
          }

          // Only focus if it is a single cell
          if (cellIds.length === 1) {
            const cellId = cellIds[0];
            actions.focusCell({ cellId, where: "after" });
            if (nextHideCode) {
              // Move focus from the editor to the cell
              editorView.current?.contentDOM.blur();
              focusCell(cellId);
            } else {
              focusCellEditor(store, cellId);
            }
          }

          return true;
        }),
        "cell.sendToBottom": addSingleHandler((cellIds) => {
          cellIds.forEach((cellId) => {
            actions.sendToBottom({ cellId });
          });
          return true;
        }),
        "cell.sendToTop": addSingleHandler((cellIds) => {
          // Send in reverse order to maintain relative positions
          cellIds.toReversed().forEach((cellId) => {
            actions.sendToTop({ cellId });
          });
          return true;
        }),
        "cell.aiCompletion": (cellId) => {
          if (!aiFeaturesEnabled) {
            return false;
          }
          let closed = false;
          setAiCompletionCell((v) => {
            // Toggle close
            if (v?.cellId === cellId) {
              closed = true;
              return null;
            }
            return { cellId };
          });
          if (closed) {
            editorView.current?.focus();
          }
          return true;
        },
        "cell.cellActions": () => {
          cellActionDropdownRef.current?.toggle();
          return true;
        },

        // Command mode
        "command.hideCode": addSingleHandler((cellIds) => {
          const markdownCellIds = cellIds.filter(
            (id) =>
              getCurrentLanguageAdapter(ensureCellEditorView(id) ?? null) ===
              "markdown",
          );
          if (markdownCellIds.length === 0) {
            return false;
          }

          const cellConfigs = markdownCellIds.map(
            (id) => store.get(notebookAtom).cellData[id]?.config,
          );
          const nextHideCode = !cellConfigs.every(
            (config) => config?.hide_code,
          );

          void saveCellConfig({
            configs: Object.fromEntries(
              markdownCellIds.map((id) => [id, { hide_code: nextHideCode }]),
            ),
          });

          for (const id of markdownCellIds) {
            actions.updateCellConfig({
              cellId: id,
              config: { hide_code: nextHideCode },
            });
          }

          return true;
        }),
        // Leaves cell select mode, like Helix's `y`.
        "command.copyCell": addSingleHandler((cellIds) => {
          copyCells(cellIds);
          selectionActions.setSelectMode({ selectMode: false });
          return true;
        }),
        "command.cellToMarkdown": addSingleHandler((cellIds) => {
          for (const id of cellIds) {
            if (id === SETUP_CELL_ID) {
              continue;
            }
            const targetView = ensureCellEditorView(id);
            if (!targetView) {
              continue;
            }
            const cellConfig = store.get(notebookAtom).cellData[id]?.config;
            convertCellToMarkdown({
              editorView: targetView,
              cellId: id,
              autoInstantiate,
              hideCode: cellConfig?.hide_code ?? false,
              createNewCell: actions.createNewCell,
              updateCellConfig: actions.updateCellConfig,
              saveCellConfig,
            });
          }
          return true;
        }),
        "command.cellToCode": addSingleHandler((cellIds) => {
          for (const id of cellIds) {
            if (id === SETUP_CELL_ID) {
              continue;
            }
            const targetView = ensureCellEditorView(id);
            if (targetView) {
              switchLanguage(targetView, { language: "python" });
            }
          }
          return true;
        }),
        "command.cutCell": addSingleHandler((cellIds) => {
          cutCells(cellIds);
          return true;
        }),
        "command.pasteCell": (cellId) => {
          pasteAtCell(cellId);
          return true;
        },
        "command.pasteCellAbove": (cellId) => {
          pasteAtCell(cellId, { before: true });
          return true;
        },
        "command.createCellBefore": (cellId) => {
          actions.createNewCell({ cellId, before: true, autoFocus: true });
          return true;
        },
        "command.createCellAfter": (cellId) => {
          actions.createNewCell({ cellId, before: false, autoFocus: true });
          return true;
        },
        "command.createSqlCellAfter": (cellId) => {
          maybeAddMarimoImport({
            autoInstantiate: true,
            createNewCell: actions.createNewCell,
            fromCellId: cellId,
            before: true,
          });
          actions.createNewCell({
            cellId,
            before: false,
            autoFocus: true,
            code: LanguageAdapters.sql.defaultCode,
          });
          return true;
        },
        "cell.delete": () => {
          // Only handle if destructive_delete is enabled
          if (!userConfig.keymap.destructive_delete) {
            return false;
          }

          const cellIds = getCellIdsToDelete();
          if (!cellIds) {
            return false;
          }

          // First keymap sets pending, second deletes
          if (pendingDeleteService.idle) {
            pendingDeleteService.submit(cellIds);
            return true;
          }

          // user repeated keymap
          deleteCells({ cellIds });
          pendingDeleteService.clear();
          return true;
        },
        // Like Helix's `d`: deletes immediately, since destructive delete is
        // implied by binding it, and leaves cell select mode.
        "command.deleteCellToClipboard": () => {
          const cellIds = getCellIdsToDelete();
          if (!cellIds) {
            return false;
          }
          copyCells(cellIds);
          deleteCells({ cellIds });
          selectionActions.setSelectMode({ selectMode: false });
          return true;
        },
        "command.undoDelete": () => {
          actions.undoDeleteCell();
          return true;
        },
        "command.openCellAbove": () => openNewCell(true),
        "command.openCellBelow": () => openNewCell(false),
        "cell.viewAsMarkdown": (cellId) => {
          const view = ensureCellEditorView(cellId);
          return view ? toggleMarkdown(view) : false;
        },
        "cell.viewAsSQL": (cellId) => {
          const view = ensureCellEditorView(cellId);
          return view ? toggleSQL(view) : false;
        },
      };

      // Runs an action on this cell, or on the cell selection if it has
      // several cells. An action without a handler here, such as a notebook
      // action bound in cell command scope, runs its registered handler.
      const runAction = (action: HotkeyAction): boolean => {
        const handler = shortcuts[action];
        if (!handler) {
          const registered = registeredActions[action];
          if (!registered) {
            return false;
          }
          registered();
          return true;
        }
        if (typeof handler === "function") {
          return handler(cellId);
        }
        return selectedCells.size >= 2
          ? handler.bulkHandle([...selectedCells])
          : handler.handle(cellId);
      };

      const nativeEvent = evt.nativeEvent || evt;

      // Cell command scope bindings take precedence over notebook ones.
      if (handleCellCommandBindings(nativeEvent, hotkeys, runAction)) {
        evt.preventDefault();
        return;
      }

      // Notebook scope bindings of actions this cell handles. An action with a
      // registered document listener handles its own notebook bindings.
      for (const action of hotkeys.iterate()) {
        if (!shortcuts[action] || registeredActions[action]) {
          continue;
        }
        const keys = hotkeys.getKeys(action, "notebook");
        if (keys.some((key) => parseShortcut(key)(nativeEvent))) {
          if (runAction(action)) {
            evt.preventDefault();
          }
          return;
        }
      }

      evt.continuePropagation();
    },
  });

  return mergeProps(focusWithinProps, keyboardProps, {
    "data-selected": isSelected,
    "data-select-mode": isSelectMode,
    className:
      "data-[selected=true]:ring-1 data-[selected=true]:ring-(--blue-8) data-[selected=true]:ring-offset-1 data-[selected=true]:data-[select-mode=true]:ring-(--orange-8)",
  });
}

/**
 * Props for cell editor navigation,
 * to manage focus and selection.
 *
 * Handles both keyboard and mouse navigation.
 */
export function useCellEditorNavigationProps(
  cellId: CellId,
  editorView: React.RefObject<EditorView | null>,
) {
  const store = useStore();
  const temporarilyShownCodeActions = useTemporarilyShownCodeActions();
  const keymapPreset = useAtomValue(keymapPresetAtom);
  const hotkeys = useAtomValue(hotkeysAtom);

  const vimCommandModeShortcut = useMemo(() => {
    const matchers = hotkeys
      .getKeys("command.vimEnterCommandMode", "editor")
      .map(parseShortcut);
    return (evt: Parameters<(typeof matchers)[number]>[0]) =>
      matchers.some((matches) => matches(evt));
  }, [hotkeys]);

  const exitToCommandMode = () => {
    temporarilyShownCodeActions.remove(cellId);
    focusCell(cellId);
    // Scroll to cell in case it is not in view because of layout shifts.
    raf2(() => {
      scrollCellIntoView(cellId);
    });
  };

  const handleEscape = () => {
    // If there is a text selection or autocomplete popup in the editor, we clear those and return.
    // Subsequent 'Escapes' will exit to command mode.

    if (!editorView.current) {
      // If no editor, we can exit to command mode immediately
      exitToCommandMode();
      return;
    }

    const view = editorView.current;
    const state = view.state;

    const wasSimplified = simplifySelection(view);
    if (wasSimplified) {
      return;
    }

    const hasSignatureHelp =
      Boolean(state.field(signatureHelpTooltipField, false)) ||
      Boolean(state.field(signatureHintField, false));
    const hasAutocompletePopup = completionStatus(state) !== null;
    if (hasSignatureHelp) {
      closeSignatureHelp(view);
    }

    if (hasAutocompletePopup) {
      closeCompletion(view);
    }

    if (hasSignatureHelp || hasAutocompletePopup) {
      return;
    }

    exitToCommandMode();
  };

  const handleHelixEscape = (target: EventTarget) => {
    const view = editorView.current;
    if (!view) {
      exitToCommandMode();
      return;
    }

    // The engine's `:` and `/` prompts live outside the content DOM and close
    // themselves on Escape.
    if (!(target instanceof Node && view.contentDOM.contains(target))) {
      return;
    }

    // Escape in insert mode belongs to the engine (back to normal mode). In
    // normal mode a single Escape leaves, even with an active selection, so
    // the selection-simplifying step of the other presets is skipped.
    if (isInHelixNormalMode(view)) {
      exitToCommandMode();
    }
  };

  const { keyboardProps } = useKeyboard({
    onKeyDown: (evt) => {
      if (keymapPreset === "vim") {
        // For vim mode, use configurable shortcut
        if (vimCommandModeShortcut(evt)) {
          handleEscape();
        }
      } else if (keymapPreset === "helix") {
        if (evt.key === "Escape") {
          handleHelixEscape(evt.target);
        }
      } else {
        // For non-vim mode, regular Escape exits to command mode
        if (evt.key === "Escape") {
          handleEscape();
        }
      }
      evt.continuePropagation();
    },
  });

  return mergeProps(keyboardProps, {
    // The cell's onFocusWithin misses focus moving from the cell into its
    // editor, and the flag is checked rather than whether the code is shown
    // so an empty Markdown cell stays revealed once its first character is
    // typed.
    onFocus: () => {
      if (store.get(notebookAtom).cellData[cellId]?.config.hide_code) {
        temporarilyShownCodeActions.add(cellId);
      }
    },
  });
}

function findClosestAdjacentCell(
  currentCellId: CellId,
  adjacentColumn: CollapsibleTree<CellId>,
): CellId {
  const current = document.getElementById(HTMLCellId.create(currentCellId));

  if (!current) {
    // fallback to first
    return adjacentColumn.first();
  }

  const currentRect = current.getBoundingClientRect();
  // first to to either overlap or contain the current cell's top edge
  for (const candidateId of adjacentColumn.topLevelIds) {
    const candidate = document.getElementById(HTMLCellId.create(candidateId));
    if (candidate) {
      const candidateRect = candidate.getBoundingClientRect();
      if (
        currentRect.top <= candidateRect.bottom &&
        currentRect.bottom >= candidateRect.top
      ) {
        return candidateId;
      }
    }
  }

  // no aligned cells (column beyond other), jump to last element
  return adjacentColumn.last();
}

export function closeSignatureHelp(view: EditorView) {
  if (view.state.field(signatureHelpTooltipField, false)) {
    view.dispatch({ effects: setSignatureHelpTooltip.of(null) });
  }
  closeSignatureHint(view);
}
