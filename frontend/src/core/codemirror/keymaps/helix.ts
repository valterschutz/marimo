/* Copyright 2026 Marimo. All rights reserved. */

import type { Extension } from "@codemirror/state";
import { type Command, EditorView, type KeyBinding } from "@codemirror/view";
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
    helix({ config: { "editor.cursor-shape.insert": "bar" } }),
    commands.of(typableCommands()),
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
