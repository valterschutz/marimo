/* Copyright 2026 Marimo. All rights reserved. */

import { editorKeyBindings } from "@/core/hotkeys/shortcuts";
import {
  highlightSelectionMatches,
  selectNextOccurrence,
} from "@codemirror/search";
import { keymap } from "@codemirror/view";
import type { HotkeyProvider } from "@/core/hotkeys/hotkeys";
import {
  highlightTheme,
  searchHighlighter,
  searchState,
} from "./search-highlight";
import { closeFindReplacePanel, openFindReplacePanel } from "./state";

export function findReplaceBundle(
  hotkeys: HotkeyProvider,
  { highlightMatches = true }: { highlightMatches?: boolean } = {},
) {
  return [
    keymap.of([
      {
        key: "Escape",
        // This is needed for Vim to go back to normal mode
        preventDefault: false,
        run: closeFindReplacePanel,
      },
      ...editorKeyBindings(hotkeys, "cell.selectNextOccurrence", {
        preventDefault: true,
        run: selectNextOccurrence,
      }),
      ...editorKeyBindings(hotkeys, "cell.findAndReplace", {
        preventDefault: true,
        run: openFindReplacePanel,
      }),
    ]),
    highlightMatches ? highlightSelectionMatches() : [],
    searchHighlighter,
    searchState,
    highlightTheme,
  ];
}
