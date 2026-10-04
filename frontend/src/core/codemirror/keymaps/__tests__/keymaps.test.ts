/* Copyright 2026 Marimo. All rights reserved. */

import {
  copyLineDown,
  copyLineUp,
  defaultKeymap as originalDefaultKeymap,
} from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { commands } from "codemirror-helix";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cellId as asCellId } from "@/__tests__/branded";
import type { KeymapConfig } from "@/core/config/config-schema";
import { focusCell } from "@/components/editor/navigation/focus-utils";
import {
  HotkeyProvider,
  OverridingHotkeyProvider,
} from "@/core/hotkeys/hotkeys";
import {
  cellActionsState,
  cellIdState,
  type CodemirrorCellActions,
} from "../../cells/state";
import { isInHelixNormalMode, setHelixMode } from "../helix";
import { KEYMAP_PRESETS, keymapBundle, visibleForTesting } from "../keymaps";

vi.mock("@/components/editor/navigation/focus-utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  focusCell: vi.fn(),
  raf2: (callback: () => void) => callback(),
}));

const { defaultKeymap, defaultVimKeymap, overrideKeymap, OVERRIDDEN_COMMANDS } =
  visibleForTesting;

describe("keymaps", () => {
  it("should filter out overridden commands from default keymap", () => {
    // Get the defaultKeymap function result
    const filteredKeymap = defaultKeymap();

    // Original keymap should have more entries than the filtered one
    expect(originalDefaultKeymap.length).toBeGreaterThan(filteredKeymap.length);

    // The difference should be equal to the size of OVERRIDDEN_COMMANDS
    expect(originalDefaultKeymap.length - filteredKeymap.length).toBe(
      OVERRIDDEN_COMMANDS.size,
    );

    // Verify none of the overridden commands are in the filtered keymap
    for (const binding of filteredKeymap) {
      expect(OVERRIDDEN_COMMANDS.has(binding.run)).toBe(false);
    }
  });

  it("defaultVimKeymap should remove conflicting keys", () => {
    const vimKeymap = defaultVimKeymap();
    expect(vimKeymap.length).toBeLessThan(defaultKeymap().length);
  });

  it("overrideKeymap should have the same size as OVERRIDDEN_COMMANDS", () => {
    const keys = overrideKeymap(HotkeyProvider.create());
    expect(keys.length).toBe(OVERRIDDEN_COMMANDS.size);

    for (const command of OVERRIDDEN_COMMANDS) {
      expect(keys.some((k) => k.run === command)).toBe(true);
    }
  });

  it.each([
    ["cell.copyLineUp", copyLineUp, "Alt-Shift-ArrowUp"],
    ["cell.copyLineDown", copyLineDown, "Alt-Shift-ArrowDown"],
  ] as const)(
    "%s is bound to the configured hotkey, not CodeMirror's default",
    (action, command, defaultKey) => {
      // Without an override, the binding matches CodeMirror's default key.
      expect(
        overrideKeymap(HotkeyProvider.create()).find((k) => k.run === command)
          ?.key,
      ).toBe(defaultKey);

      // With an override, the binding follows the user's configured key.
      // This is what `editable: true` on these hotkeys promises.
      expect(
        overrideKeymap(
          new OverridingHotkeyProvider({ [action]: "Ctrl-d" }),
        ).find((k) => k.run === command)?.key,
      ).toBe("Ctrl-d");
    },
  );
});

describe("selection mark", () => {
  function markedSelection(preset: KeymapConfig["preset"]) {
    const view = new EditorView({
      state: EditorState.create({
        doc: "print(1)",
        selection: EditorSelection.range(0, 5),
        extensions: keymapBundle({ preset, overrides: {} }, HotkeyProvider.create()),
      }),
      parent: document.body,
    });
    const marked = view.contentDOM.querySelector(".cm-hx-selection");
    view.destroy();
    return marked?.textContent ?? null;
  }

  it("is drawn by the helix preset", () => {
    expect(markedSelection("helix")).toBe("print");
  });

  it.each(
    KEYMAP_PRESETS.filter((preset) => preset !== "helix"),
  )("is not drawn by the %s preset", (preset) => {
    expect(markedSelection(preset)).toBeNull();
  });
});

describe("helix keymap bundle", () => {
  const cellId = asCellId("0");
  const moveToNextCell = vi.fn();
  const saveNotebook = vi.fn();
  const views: EditorView[] = [];

  function createView(doc: string) {
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          keymapBundle(
            { preset: "helix", overrides: {} },
            HotkeyProvider.create(),
          ),
          cellIdState.of(cellId),
          cellActionsState.of({
            moveToNextCell,
            saveNotebook,
          } as unknown as CodemirrorCellActions),
        ],
      }),
      parent: document.body,
    });
    views.push(view);
    return view;
  }

  function press(view: EditorView, key: string, shiftKey = false) {
    return runScopeHandlers(
      view,
      new KeyboardEvent("keydown", { key, shiftKey }),
      "editor",
    );
  }

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.destroy();
    }
    vi.clearAllMocks();
  });

  it("loads the engine in normal mode with a bar insert cursor", () => {
    const view = createView("print(1)");
    expect(view.dom.querySelector(".cm-hx-status-panel")).not.toBeNull();
    expect(isInHelixNormalMode(view)).toBe(true);

    press(view, "i");
    expect(isInHelixNormalMode(view)).toBe(false);
    // The engine only drops its block cursor in insert mode when the insert
    // cursor is configured as a bar.
    expect(view.scrollDOM.classList.contains("cm-hx-block-cursor")).toBe(
      false,
    );

    press(view, "Escape");
    expect(isInHelixNormalMode(view)).toBe(true);
  });

  it("switches modes with setHelixMode alongside marimo's keymaps", () => {
    const view = createView("a");

    setHelixMode(view, "insert");
    expect(isInHelixNormalMode(view)).toBe(false);

    setHelixMode(view, "normal");
    expect(isInHelixNormalMode(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("a");
  });

  it("includes marimo's override keymap", () => {
    const view = createView("");
    const bindings = view.state.facet(keymap).flat();
    for (const command of OVERRIDDEN_COMMANDS) {
      expect(bindings.some((binding) => binding.run === command)).toBe(true);
    }
  });

  it("keeps j on the last line and k on the first line inside the editor", () => {
    const view = createView("a\nb");
    const currentLine = () =>
      view.state.doc.lineAt(view.state.selection.main.head).number;

    view.dispatch({ selection: { anchor: 2, head: 3 } });
    press(view, "j");
    expect(currentLine()).toBe(2);

    view.dispatch({ selection: { anchor: 0, head: 1 } });
    press(view, "k");
    expect(currentLine()).toBe(1);

    expect(moveToNextCell).not.toHaveBeenCalled();
  });

  it("applies marimo's default keymap in insert mode only", () => {
    const view = createView("a");

    // Shift-Enter is bound by the default keymap but not by the engine.
    press(view, "Enter", true);
    expect(view.state.doc.toString()).toBe("a");

    press(view, "i");
    press(view, "Enter", true);
    expect(view.state.doc.toString()).toBe("\na");
  });

  it("provides the :w, :q and :wq commands", () => {
    const view = createView("a");
    const byName = new Map(
      view.state
        .facet(commands)
        .flat()
        .map((command) => [command.name, command]),
    );
    expect([...byName.keys()]).toEqual(
      expect.arrayContaining(["w", "q", "wq"]),
    );

    byName.get("w")?.handler(view, []);
    expect(saveNotebook).toHaveBeenCalledTimes(1);
    expect(focusCell).not.toHaveBeenCalled();

    byName.get("q")?.handler(view, []);
    expect(saveNotebook).toHaveBeenCalledTimes(1);
    expect(focusCell).toHaveBeenCalledWith(cellId);

    byName.get("wq")?.handler(view, []);
    expect(saveNotebook).toHaveBeenCalledTimes(2);
    expect(focusCell).toHaveBeenCalledTimes(2);
  });
});
