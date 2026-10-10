/* Copyright 2026 Marimo. All rights reserved. */

import { closeCompletion, completionStatus } from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import {
  EditorView,
  type KeyBinding,
  keymap,
  type ViewUpdate,
} from "@codemirror/view";
import { createTracebackInfoAtom } from "@/core/cells/cells";
import { type CellId, HTMLCellId, SCRATCH_CELL_ID } from "@/core/cells/ids";
import {
  clearPendingCutAtom,
  pendingCutCellIdsAtom,
} from "@/core/cells/pending-cut-service";
import { loroSyncAnnotation } from "@/core/codemirror/rtc/loro/sync";
import type { KeymapConfig } from "@/core/config/config-schema";
import type { HotkeyProvider } from "@/core/hotkeys/hotkeys";
import { getFeatureFlag } from "@/core/config/feature-flag";
import {
  duplicateWithCtrlModifier,
  editorKeyBindings,
} from "@/core/hotkeys/shortcuts";
import { store } from "@/core/state/jotai";
import { createObservable } from "@/core/state/observable";
import { formatKeymapExtension } from "../extensions";
import { formattingChangeEffect } from "../format";
import { goToDefinitionAtCursorPosition } from "../go-to-definition/utils";
import { getEditorCodeAsPython } from "../language/utils";
import { isAtEndOfEditor, isAtStartOfEditor } from "../utils";
import {
  breakpointGutter,
  debuggerLineHighlighter,
} from "./debugger-decorations";
import {
  createActiveLineInfoAtom,
  createCellBreakpointsAtom,
  createDebuggerLineAtom,
} from "./debugger-state";
import { activeLineTimer } from "./line-timing-decorations";
import {
  type CodemirrorCellActions,
  cellActionsState,
  cellIdState,
} from "./state";
import { errorLineHighlighter } from "./traceback-decorations";

/**
 * Extensions for cell actions
 */
function cellKeymaps({
  cellId,
  hotkeys,
}: {
  cellId: CellId;
  hotkeys: HotkeyProvider;
}): Extension[] {
  const keybindings: KeyBinding[] = [];

  // Run-related keybindings get Ctrl equivalents on macOS for Jupyter/Colab users
  keybindings.push(
    ...editorKeyBindings(hotkeys, "cell.run", {
      preventDefault: true,
      stopPropagation: true,
      run: (ev) => {
        const actions = ev.state.facet(cellActionsState);
        actions.onRun();
        return true;
      },
    }).flatMap(duplicateWithCtrlModifier),
    // Shift-Enter has no Cmd, so no Ctrl equivalent needed
    ...editorKeyBindings(hotkeys, "cell.runAndNewBelow", {
      preventDefault: true,
      stopPropagation: true,
      run: (ev) => {
        const actions = ev.state.facet(cellActionsState);
        actions.onRun();
        if (cellId === SCRATCH_CELL_ID) {
          return true;
        }
        ev.contentDOM.blur();
        actions.moveToNextCell({ cellId, before: false });
        return true;
      },
    }),
    ...editorKeyBindings(hotkeys, "cell.runAndNewAbove", {
      preventDefault: true,
      stopPropagation: true,
      run: (ev) => {
        const actions = ev.state.facet(cellActionsState);
        actions.onRun();
        if (cellId === SCRATCH_CELL_ID) {
          return true;
        }
        ev.contentDOM.blur();
        actions.moveToNextCell({ cellId, before: true });
        return true;
      },
    }).flatMap(duplicateWithCtrlModifier),
    ...editorKeyBindings(hotkeys, "cell.aiCompletion", {
      preventDefault: true,
      stopPropagation: true,
      run: (ev) => {
        const actions = ev.state.facet(cellActionsState);
        const closed = actions.aiCellCompletion();
        if (closed) {
          ev.contentDOM.focus();
        }
        return true;
      },
    }),
  );

  if (cellId !== SCRATCH_CELL_ID) {
    keybindings.push(
      ...editorKeyBindings(hotkeys, "cell.goToDefinition", {
        run: (ev) => {
          return goToDefinitionAtCursorPosition(ev);
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.delete", {
        preventDefault: true,
        stopPropagation: true,
        run: (cm) => {
          // When editing (not command mode), only allow deletion of empty cells
          if (cm.state.doc.length === 0) {
            const actions = cm.state.facet(cellActionsState);
            actions.deleteCell();
          }
          // shortcuts.delete (shift-backspace) overlaps with
          // defaultKeymap's deleteCharBackward (backspace); we don't want
          // shift-backspace to trigger character deletion, because otherwise
          // users might accidentally delete their whole notebook if they
          // absent-mindedly held these keys. That's why we always return true.
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.moveUp", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.moveCell({ cellId, before: true });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.moveDown", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.moveCell({ cellId, before: false });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.moveLeft", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.moveCell({ cellId, before: true, direction: "left" });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.moveRight", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.moveCell({ cellId, before: false, direction: "right" });
          return true;
        },
      }),
      {
        key: "ArrowUp",
        run: (ev) => {
          // Skip if we are in the middle of an autocompletion
          const hasAutocomplete = completionStatus(ev.state);
          if (hasAutocomplete) {
            return false;
          }

          if (isAtStartOfEditor(ev)) {
            const actions = ev.state.facet(cellActionsState);
            actions.moveToNextCell({ cellId, before: true, noCreate: true });
            return true;
          }
          return false;
        },
      },
      {
        key: "ArrowDown",
        run: (ev) => {
          // Skip if we are in the middle of an autocompletion
          const hasAutocomplete = completionStatus(ev.state);
          if (hasAutocomplete) {
            return false;
          }

          if (isAtEndOfEditor(ev)) {
            const actions = ev.state.facet(cellActionsState);
            actions.moveToNextCell({ cellId, before: false, noCreate: true });
            return true;
          }
          return false;
        },
      },
      ...editorKeyBindings(hotkeys, "cell.focusDown", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.moveToNextCell({ cellId, before: false, noCreate: true });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.focusUp", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.moveToNextCell({ cellId, before: true, noCreate: true });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.sendToBottom", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.sendToBottom({ cellId });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.sendToTop", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.sendToTop({ cellId });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.createAbove", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          ev.contentDOM.blur();
          const actions = ev.state.facet(cellActionsState);
          actions.createNewCell({ cellId, before: true });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.createBelow", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          ev.contentDOM.blur();
          const actions = ev.state.facet(cellActionsState);
          actions.createNewCell({ cellId, before: false });
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.hideCode", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          const isHidden = actions.toggleHideCode();
          closeCompletion(ev);
          // If we are newly hidden, blur the editor
          if (isHidden) {
            ev.contentDOM.blur();
            // Focus on the parent element
            // https://github.com/marimo-team/marimo/issues/2941
            document.getElementById(HTMLCellId.create(cellId))?.focus();
          } else {
            ev.contentDOM.focus();
          }
          return true;
        },
      }),
      ...editorKeyBindings(hotkeys, "cell.splitCell", {
        preventDefault: true,
        stopPropagation: true,
        run: (ev) => {
          const actions = ev.state.facet(cellActionsState);
          actions.splitCell({ cellId });
          if (!actions.moveToNextCell) {
            return true;
          }
          requestAnimationFrame(() => {
            ev.contentDOM.blur();
            actions.moveToNextCell({ cellId, before: false }); // focus new cell
          });
          return true;
        },
      }),
    );
  }

  // Highest priority so that we can override the default keymap
  return [Prec.high(keymap.of(keybindings))];
}

/**
 * Extensions for cell code editing
 */
function cellCodeEditing(hotkeys: HotkeyProvider): Extension[] {
  const onChangePlugin = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      // Check if the doc update was a formatting change
      // e.g. changing from python to markdown
      const isFormattingChange = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(formattingChangeEffect)),
      );
      const nextCode = getEditorCodeAsPython(update.view);
      const cellActions = update.view.state.facet(cellActionsState);
      const cellId = update.view.state.facet(cellIdState);
      cellActions.updateCellCode({
        cellId,
        code: nextCode,
        formattingChange: isFormattingChange,
      });

      // Clear pending cut state if this cell was marked for cut
      const pendingCutCellIds = store.get(pendingCutCellIdsAtom);
      if (pendingCutCellIds.has(cellId)) {
        store.set(clearPendingCutAtom);
      }
    }
  });

  return [onChangePlugin, formatKeymapExtension(hotkeys)];
}

const MARKDOWN_AUTORUN_USER_EVENTS = ["input", "delete", "undo", "redo"];

function shouldAutorunMarkdownUpdate({
  docChanged,
  transactions,
  predicate = () => true,
  hasFocus = false,
}: Pick<ViewUpdate, "docChanged" | "transactions"> & {
  predicate?: () => boolean;
  hasFocus?: boolean;
}): boolean {
  // If the doc didn't change, ignore.
  if (!docChanged) {
    return false;
  }

  // The caller decides when markdown autorun is allowed, e.g. not for
  // f-strings where rerunning on every keystroke is usually incorrect.
  if (!predicate()) {
    return false;
  }

  // This happens on mount when we start in markdown mode.
  // Ignore formatting changes so language switches don't trigger autorun.
  const isFormattingChange = transactions.some((tr) =>
    tr.effects.some((effect) => effect.is(formattingChangeEffect)),
  );
  if (isFormattingChange) {
    return false;
  }

  return transactions.some((tr) => {
    // Ignore RTC sync changes to avoid duplicate runs from remote edits.
    if (tr.annotation(loroSyncAnnotation) !== undefined) {
      return false;
    }

    // Prefer explicit local edit transactions, but keep a focused fallback for
    // local rewrite paths like split-cell, which can update markdown content
    // without annotating a user event.
    return (
      MARKDOWN_AUTORUN_USER_EVENTS.some((kind) => tr.isUserEvent(kind)) ||
      hasFocus
    );
  });
}

/**
 * Extension for auto-running markdown cells
 */
export function markdownAutoRunExtension({
  predicate,
}: {
  predicate: () => boolean;
}): Extension {
  return EditorView.updateListener.of((update) => {
    if (
      !shouldAutorunMarkdownUpdate({
        docChanged: update.docChanged,
        transactions: update.transactions,
        predicate,
        hasFocus: update.view.hasFocus,
      })
    ) {
      return;
    }
    const actions = update.view.state.facet(cellActionsState);
    actions.onRun();
  });
}

/**
 * Reveal hidden code when the user selects text in it, e.g. a find match.
 *
 * Only user selections count: a keymap may set a non-empty selection on its
 * own, such as the helix engine's one-character block cursor on mount.
 */
export function revealHiddenCodeOnSelection({
  onReveal,
}: {
  onReveal: () => void;
}): Extension {
  return EditorView.updateListener.of((update) => {
    if (
      update.transactions.some((tr) => tr.isUserEvent("select")) &&
      update.state.selection.ranges.some((range) => !range.empty)
    ) {
      onReveal();
    }
  });
}

export function cellBundle({
  cellId,
  hotkeys,
  cellActions,
}: {
  cellId: CellId;
  hotkeys: HotkeyProvider;
  cellActions: CodemirrorCellActions;
  keymapConfig: KeymapConfig;
}): Extension[] {
  const debuggerOn = getFeatureFlag("debugger");
  const lineTimingOn = getFeatureFlag("line_timing");
  return [
    cellActionsState.of(cellActions),
    cellIdState.of(cellId),
    cellKeymaps({ cellId, hotkeys }),
    cellCodeEditing(hotkeys),
    errorLineHighlighter(
      createObservable(createTracebackInfoAtom(cellId), store),
    ),
    // Experimental live debugger and line-timing highlight. Gated so there is
    // no gutter/overhead when disabled. Both track the same active line; when
    // both flags are on, the green timing highlight replaces the amber one.
    debuggerOn
      ? breakpointGutter(
          cellId,
          createObservable(createCellBreakpointsAtom(cellId), store),
        )
      : [],
    lineTimingOn
      ? activeLineTimer(
          createObservable(createActiveLineInfoAtom(cellId), store),
        )
      : debuggerOn
        ? debuggerLineHighlighter(
            createObservable(createDebuggerLineAtom(cellId), store),
          )
        : [],
  ];
}

export const exportedForTesting = {
  shouldAutorunMarkdownUpdate,
};
