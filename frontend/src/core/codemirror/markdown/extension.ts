/* Copyright 2026 Marimo. All rights reserved. */
import { editorKeyBindings } from "@/core/hotkeys/shortcuts";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { HotkeyProvider } from "@/core/hotkeys/hotkeys";
import {
  insertBlockquote,
  insertBoldMarker,
  insertCodeMarker,
  insertImage,
  insertItalicMarker,
  insertLink,
  insertOL,
  insertTextFile,
  insertUL,
} from "./commands";

export function enhancedMarkdownExtension(
  hotkeys: HotkeyProvider,
): Extension[] {
  return [
    Prec.highest(
      keymap.of([
        // Runs always
        ...editorKeyBindings(hotkeys, "markdown.bold", {
          stopPropagation: true,
          run: insertBoldMarker,
        }),
        // Runs always
        ...editorKeyBindings(hotkeys, "markdown.italic", {
          stopPropagation: true,
          run: insertItalicMarker,
        }),
        // Only runs on selection
        ...editorKeyBindings(hotkeys, "markdown.link", {
          stopPropagation: true,
          run: (cm) => insertLink(cm),
        }),
        // Only runs on selection
        ...editorKeyBindings(hotkeys, "markdown.orderedList", {
          run: insertOL,
        }),
        // Only runs on selection
        ...editorKeyBindings(hotkeys, "markdown.unorderedList", {
          run: insertUL,
        }),
        // Only runs on selection
        ...editorKeyBindings(hotkeys, "markdown.blockquote", {
          run: insertBlockquote,
        }),
        // Only runs on selection
        ...editorKeyBindings(hotkeys, "markdown.code", {
          run: insertCodeMarker,
        }),
        // Only runs on selection
        {
          key: "`",
          run: insertCodeMarker,
        },
      ]),
    ),
    // Smart paste of URLs
    EditorView.domEventHandlers({
      paste: (event, view) => {
        // If no selection, do nothing
        if (view.state.selection.main.empty) {
          return false;
        }

        const url = event.clipboardData?.getData("text/plain");
        if (url?.startsWith("http")) {
          event.preventDefault();
          insertLink(view, url);
        }
      },
    }),
    // Smart paste of files
    EditorView.domEventHandlers({
      paste: (event, view) => {
        const file = event.clipboardData?.files[0];

        if (!file) {
          return false;
        }

        if (file.type.startsWith("image/")) {
          event.preventDefault();
          void insertImage(view, file);
          return true;
        }

        if (file.type.startsWith("text/")) {
          event.preventDefault();
          void insertTextFile(view, file);
          return true;
        }
      },
    }),
  ];
}
