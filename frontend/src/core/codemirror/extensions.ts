/* Copyright 2026 Marimo. All rights reserved. */
import { editorKeyBindings } from "@/core/hotkeys/shortcuts";
import { EditorView, keymap } from "@codemirror/view";
import type { HotkeyProvider } from "@/core/hotkeys/hotkeys";
import { invariant } from "@/utils/invariant";
import { smartScrollIntoView } from "../../utils/scroll";
import { cellActionsState, cellIdState } from "./cells/state";
import { formatEditorViews, formattingChangeEffect } from "./format";
import {
  getCurrentLanguageAdapter,
  toggleToLanguage,
} from "./language/commands";

/** Toggles the cell between Markdown and Python. */
export function toggleMarkdown(ev: EditorView): boolean {
  const currentLanguage = getCurrentLanguageAdapter(ev);
  const destinationLanguage =
    currentLanguage === "markdown" ? "python" : "markdown";

  const response = toggleToLanguage(ev, destinationLanguage, {
    force: true,
  });

  // Handle post-toggle actions
  if (response === "markdown") {
    const actions = ev.state.facet(cellActionsState);
    actions.afterToggleMarkdown();
  }

  return response !== false;
}

/** Toggles the cell between SQL and Python. */
export function toggleSQL(ev: EditorView): boolean {
  const currentLanguage = getCurrentLanguageAdapter(ev);
  const destinationLanguage = currentLanguage === "sql" ? "python" : "sql";

  const response = toggleToLanguage(ev, destinationLanguage, {
    force: true,
  });

  if (response === "sql") {
    const actions = ev.state.facet(cellActionsState);
    actions.afterToggleSQL();
  }

  return response !== false;
}

/**
 * Add a keymap to format the code in the editor.
 */
export function formatKeymapExtension(hotkeys: HotkeyProvider) {
  return keymap.of([
    ...editorKeyBindings(hotkeys, "cell.format", {
      preventDefault: true,
      run: (ev) => {
        const cellId = ev.state.facet(cellIdState);
        formatEditorViews({ [cellId]: ev });
        return true;
      },
    }),
    ...editorKeyBindings(hotkeys, "cell.viewAsMarkdown", {
      preventDefault: true,
      run: toggleMarkdown,
    }),
    ...editorKeyBindings(hotkeys, "cell.viewAsSQL", {
      preventDefault: true,
      run: toggleSQL,
    }),
  ]);
}

/**
 * Scroll the active line into view when the editor is resized,
 * with an offset.
 *
 * This is necessary when typings at the edges of the editor
 * and the user is blocked by the hovering action bar.
 */
export function scrollActiveLineIntoViewExtension() {
  return EditorView.updateListener.of((update) => {
    // Ignore if the editor does not have focus, ignore
    if (!update.view.hasFocus) {
      return;
    }

    // A new line was added, scroll the active line into view
    if (update.heightChanged && update.docChanged) {
      // Ignore formatting changes
      const isFormattingChange = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(formattingChangeEffect)),
      );
      if (isFormattingChange) {
        return;
      }

      scrollActiveLineIntoView(update.view, { behavior: "smooth" });
    }
  });
}

export function scrollActiveLineIntoView(
  editor: EditorView,
  opts: {
    behavior: "smooth" | "instant";
  },
) {
  const activeLines = editor.dom.getElementsByClassName(
    "cm-activeLine cm-line",
  );
  // Only scroll if there is an active line
  if (activeLines.length === 1) {
    const activeLine = activeLines[0] as HTMLElement;
    const appEl = document.getElementById("App");
    invariant(appEl, "App not found");
    smartScrollIntoView(activeLine, {
      offset: { top: 30, bottom: 150 },
      body: appEl,
      behavior: opts.behavior,
    });
  }
}
