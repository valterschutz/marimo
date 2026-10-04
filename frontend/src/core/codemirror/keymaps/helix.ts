/* Copyright 2026 Marimo. All rights reserved. */

import { type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  type Command,
  Decoration,
  EditorView,
  type KeyBinding,
  runScopeHandlers,
  ViewPlugin,
} from "@codemirror/view";
import { commands, helix, type TypableCommand } from "codemirror-helix";
import { focusCell, raf2 } from "@/components/editor/navigation/focus-utils";
import { cellActionsState, cellIdState } from "../cells/state";

/**
 * Whether the Helix engine is in normal or select mode, as opposed to insert.
 *
 * `codemirror-helix` exports no mode reader, so this reads the mode label the
 * engine maintains in its statusline (`NOR`, `SEL` or `INS`). Without a
 * statusline the editor is assumed not to be in insert mode. Swap this for a
 * public API once the library offers one.
 */
export function isInHelixNormalMode(view: EditorView): boolean {
  const mode = view.dom.querySelector(".cm-hx-status-panel > span");
  return mode?.textContent !== "INS";
}

/**
 * Put the Helix engine in normal or insert mode.
 *
 * The engine keeps its mode while the editor is unfocused, so this is used to
 * choose the mode when an editor is opened from cell command mode.
 * `codemirror-helix` exports no insert-mode effect, and its `resetMode` effect
 * skips committing a pending insert to the engine's undo history, so this runs
 * the engine's own Escape and `i` bindings instead.
 */
export function setHelixMode(
  view: EditorView,
  mode: "normal" | "insert",
): void {
  // Escape also leaves select mode and drops pending prefixes such as `g`. A
  // second press is needed when the first only cancels an insert-mode prefix
  // such as Ctrl-r.
  runHelixKey(view, "Escape");
  if (!isInHelixNormalMode(view)) {
    runHelixKey(view, "Escape");
  }
  if (mode === "insert") {
    runHelixKey(view, "i");
  }
}

function runHelixKey(view: EditorView, key: string): void {
  runScopeHandlers(view, new KeyboardEvent("keydown", { key }), "editor");
}

/**
 * The Helix engine with a bar insert cursor, marimo's `:` commands, and the
 * Escape handling the cell editor relies on.
 */
export function helixExtension(): Extension[] {
  return [
    // The engine leaves insert mode before Escape bubbles to the cell's React
    // handler, which would then see normal mode and leave the editor too.
    // Observers run before any key handler, so the mode read here is the one
    // the user pressed Escape in.
    EditorView.domEventObservers({
      keydown(event, view) {
        if (event.key === "Escape" && !isInHelixNormalMode(view)) {
          event.stopPropagation();
        }
      },
    }),
    // Ahead of the engine, so their rules land later in the stylesheet and
    // win over the engine's equally specific ones.
    hidePanelsTheme,
    blockCursorTheme,
    helix({ config: { "editor.cursor-shape.insert": "bar" } }),
    commands.of(typableCommands()),
    focusedField,
    blockCursorOnlyWhileFocused,
    selectionMark,
  ];
}

const setFocusedEffect = StateEffect.define<boolean>();

/** Whether the editor has focus, for marks drawn only while it does. */
const focusedField = StateField.define<boolean>({
  create: () => false,
  update: (focused, tr) =>
    tr.effects.reduce(
      (value, effect) => (effect.is(setFocusedEffect) ? effect.value : value),
      focused,
    ),
  provide: () =>
    EditorView.focusChangeEffect.of((_state, focusing) =>
      setFocusedEffect.of(focusing),
    ),
});

const BLOCK_CURSOR_CLASS = "cm-hx-block-cursor";

/**
 * Draw the block cursor only while the editor has focus, like CodeMirror's
 * own caret, so unfocused cells show no cursor.
 *
 * Every cursor style, the engine's and custom CSS alike, hangs off a class
 * the engine puts on the scroller on mount and toggles on mode changes. This
 * resyncs the class after the engine on every update. Must come after the
 * engine.
 */
const blockCursorOnlyWhileFocused: Extension = [
  ViewPlugin.define((view) => {
    view.scrollDOM.classList.toggle(BLOCK_CURSOR_CLASS, view.hasFocus);
    return {};
  }),
  EditorView.updateListener.of(({ view }) => {
    view.scrollDOM.classList.toggle(
      BLOCK_CURSOR_CLASS,
      view.hasFocus && isInHelixNormalMode(view),
    );
  }),
];

const selectionMarkDecoration = Decoration.mark({ class: "cm-hx-selection" });

/**
 * Mark every non-empty selection range on the text itself, in every editor
 * mode, with a class that carries no styling of its own. Like the block
 * cursor, the marks are drawn only while the editor has focus.
 *
 * CodeMirror draws selections as a band behind the text, which an opaque
 * active-line background hides and which cannot recolour the selected text.
 * The mark lets custom CSS paint selections the way Helix does.
 */
const selectionMark = EditorView.decorations.compute(
  ["selection", focusedField],
  (state) =>
    state.field(focusedField)
      ? Decoration.set(
          state.selection.ranges
            .filter((range) => !range.empty)
            .map((range) =>
              selectionMarkDecoration.range(range.from, range.to),
            ),
          true,
        )
      : Decoration.none,
);

/**
 * Hide the engine's per-cell panels, which would otherwise repeat under every
 * cell. The cursor shape already tells editor insert mode apart.
 */
const hidePanelsTheme = EditorView.theme({
  // Hidden rather than removed: the mode readers parse the mode from it.
  // `&.cm-editor` outranks the engine's rule, which sets `display: flex`.
  "&.cm-editor .cm-hx-status-panel": {
    display: "none",
  },
  // The engine keeps the command panel mounted and only toggles its prompt's
  // visibility, so collapse it unless a `:` or `/` prompt input is present.
  // A pending prefix such as `g` writes text but no input, and stays hidden.
  ".cm-hx-command-panel:not(:has(.cm-hx-command-input))": {
    display: "none",
  },
  // The container would otherwise keep its border with nothing inside. Other
  // bottom panels keep it visible. No commas: `EditorView.theme` splits
  // selectors on them, even inside `:not()`.
  ".cm-panels-bottom:not(:has(> :not(.cm-hx-status-panel):not(.cm-hx-command-panel))):not(:has(.cm-hx-command-input))":
    {
      display: "none",
    },
});

/**
 * Colour the block cursor with the theme's caret instead of the engine's grey.
 *
 * The block cursor is a mark decoration rather than the cursor layer's caret,
 * so it takes the caret colour from a variable. Syntax tokens nest inside the
 * mark with their own colour, hence the descendant rule that keeps the
 * character readable on a dark caret. The selectors match the engine's own
 * specificity, winning on stylesheet order, so custom CSS can still override
 * them.
 */
const blockCursorTheme = EditorView.theme({
  ".cm-hx-block-cursor .cm-hx-cursor": {
    backgroundColor: "var(--cm-caret-color, #ccc)",
    color: "var(--cm-background)",
  },
  ".cm-hx-block-cursor .cm-hx-cursor *": {
    color: "var(--cm-background)",
  },
});

const HIDE_AI_EDIT_TRIGGER_ATTRIBUTE = "data-hide-ai-edit-trigger";

/** Whether the current selection was made with the pointer. */
const pointerSelectionField = StateField.define<boolean>({
  create: () => false,
  update: (pointerSelection, tr) =>
    tr.selection ? tr.isUserEvent("select.pointer") : pointerSelection,
});

/**
 * Hide the inline AI edit trigger while the engine is in normal mode and the
 * selection came from the keyboard.
 *
 * Every normal-mode motion leaves a non-empty selection, which would otherwise
 * show the trigger on each cursor movement. Pointer and insert-mode selections
 * still show it, like the other presets. Must come after `helixExtension()`
 * so the mode is read after the engine has updated it.
 */
export function hideAiEditTriggerInHelixNormalMode(): Extension {
  return [
    pointerSelectionField,
    // An attribute rather than a class: CodeMirror rewrites the editor's
    // class attribute whenever focus changes.
    EditorView.updateListener.of(({ view, state }) => {
      const hide =
        !state.field(pointerSelectionField) && isInHelixNormalMode(view);
      view.dom.toggleAttribute(HIDE_AI_EDIT_TRIGGER_ATTRIBUTE, hide);
    }),
    EditorView.theme({
      [`&[${HIDE_AI_EDIT_TRIGGER_ATTRIBUTE}] .cm-ai-tooltip-button`]: {
        display: "none !important",
      },
    }),
  ];
}

/**
 * Restrict bindings to insert mode, leaving normal and select mode entirely
 * to the engine.
 */
export function onlyInHelixInsertMode(
  bindings: readonly KeyBinding[],
): KeyBinding[] {
  const inInsertMode = (command: Command | undefined): Command | undefined =>
    command && ((view) => !isInHelixNormalMode(view) && command(view));
  return bindings.map((binding) => ({
    ...binding,
    run: inInsertMode(binding.run),
    shift: inInsertMode(binding.shift),
  }));
}

function typableCommands(): TypableCommand[] {
  const save = (view: EditorView) => {
    view.state.facet(cellActionsState).saveNotebook();
  };
  const quit = (view: EditorView) => {
    const cellId = view.state.facet(cellIdState);
    // The engine refocuses the editor one frame after closing its prompt.
    raf2(() => focusCell(cellId));
  };
  return [
    {
      name: "w",
      aliases: ["write"],
      help: "Save the notebook",
      handler: save,
    },
    {
      name: "q",
      aliases: ["quit"],
      help: "Leave the editor and enter cell command mode",
      handler: quit,
    },
    {
      name: "wq",
      aliases: ["write-quit", "x"],
      help: "Save the notebook, then leave the editor",
      handler(view) {
        save(view);
        quit(view);
      },
    },
  ];
}
