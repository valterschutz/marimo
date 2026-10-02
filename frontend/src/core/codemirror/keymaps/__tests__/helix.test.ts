/* Copyright 2026 Marimo. All rights reserved. */

import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { helixExtension, isInHelixNormalMode, setHelixMode } from "../helix";

describe("setHelixMode", () => {
  const views: EditorView[] = [];

  function createView(doc: string) {
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: helixExtension() }),
      parent: document.body,
    });
    views.push(view);
    return view;
  }

  function press(view: EditorView, key: string) {
    runScopeHandlers(view, new KeyboardEvent("keydown", { key }), "editor");
  }

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.destroy();
    }
  });

  it("enters insert mode from normal mode without editing the document", () => {
    const view = createView("print(1)");
    expect(isInHelixNormalMode(view)).toBe(true);

    setHelixMode(view, "insert");
    expect(isInHelixNormalMode(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("print(1)");
  });

  it("enters insert mode while a goto prefix is pending", () => {
    const view = createView("a\nb");
    press(view, "g");

    setHelixMode(view, "insert");
    expect(isInHelixNormalMode(view)).toBe(false);
  });

  it("stays in insert mode when already inserting", () => {
    const view = createView("a");
    press(view, "i");

    setHelixMode(view, "insert");
    expect(isInHelixNormalMode(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("a");
  });

  it("returns to normal mode from insert mode", () => {
    const view = createView("a");
    press(view, "i");

    setHelixMode(view, "normal");
    expect(isInHelixNormalMode(view)).toBe(true);
  });

  it("returns to normal mode from a pending insert-mode prefix", () => {
    const view = createView("a");
    press(view, "i");
    runScopeHandlers(
      view,
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
      "editor",
    );

    setHelixMode(view, "normal");
    expect(isInHelixNormalMode(view)).toBe(true);
  });

  it("keeps an insert undoable after leaving insert mode", () => {
    const view = createView("a");
    setHelixMode(view, "insert");
    view.dispatch(view.state.replaceSelection("x = "));
    expect(view.state.doc.toString()).toBe("x = a");

    setHelixMode(view, "normal");
    // Re-entering insert mode must not trip over an uncommitted insert.
    setHelixMode(view, "insert");
    setHelixMode(view, "normal");
    press(view, "u");
    expect(view.state.doc.toString()).toBe("a");
  });
});
