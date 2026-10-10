/* Copyright 2026 Marimo. All rights reserved. */

import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cellId as asCellId } from "@/__tests__/branded";
import {
  type BindingOverride,
  type HotkeyAction,
  OverridingHotkeyProvider,
} from "@/core/hotkeys/hotkeys";
import { cellBundle } from "../extensions";
import type { CodemirrorCellActions } from "../state";

describe("cell keymaps with editor focus", () => {
  const createNewCell = vi.fn();
  const onRun = vi.fn();
  const views: EditorView[] = [];

  function createView(
    overrides: Partial<Record<HotkeyAction, BindingOverride>> = {},
  ) {
    const view = new EditorView({
      state: EditorState.create({
        doc: "x = 1",
        extensions: cellBundle({
          cellId: asCellId("0"),
          hotkeys: new OverridingHotkeyProvider(overrides, {
            platform: "linux",
          }),
          cellActions: {
            createNewCell,
            onRun,
          } as unknown as CodemirrorCellActions,
          keymapConfig: { preset: "default", overrides: {} },
        }),
      }),
      parent: document.body,
    });
    views.push(view);
    return view;
  }

  function press(view: EditorView, key: string, init?: KeyboardEventInit) {
    return runScopeHandlers(
      view,
      new KeyboardEvent("keydown", { key, ...init }),
      "editor",
    );
  }

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.destroy();
    }
    vi.clearAllMocks();
  });

  it("ignores a cell action's default binding, which is in cell command scope", () => {
    const view = createView();
    press(view, "p", { ctrlKey: true, shiftKey: true });
    expect(createNewCell).not.toHaveBeenCalled();
  });

  it("ignores a cell command binding on a typing key", () => {
    const view = createView({
      "cell.createBelow": { key: "o", scope: "cell-command" },
    });
    expect(press(view, "o")).toBe(false);
    expect(createNewCell).not.toHaveBeenCalled();
  });

  it("runs a cell action bound in notebook scope", () => {
    const view = createView({
      "cell.createBelow": { key: "Ctrl-Shift-o", scope: "notebook" },
    });
    press(view, "o", { ctrlKey: true, shiftKey: true });
    expect(createNewCell).toHaveBeenCalledWith({
      cellId: "0",
      before: false,
    });
  });

  it("runs every binding of an action in editor or notebook scope", () => {
    const view = createView({
      "cell.run": [
        { key: "Ctrl-Enter", scope: "notebook" },
        { key: "Alt-r", scope: "editor" },
      ],
    });
    press(view, "Enter", { ctrlKey: true });
    press(view, "r", { altKey: true });
    expect(onRun).toHaveBeenCalledTimes(2);
  });
});
