/* Copyright 2026 Marimo. All rights reserved. */

import {
  autocompletion,
  completionStatus,
  completionKeymap as defaultCompletionKeymap,
  selectedCompletionIndex,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vim } from "@replit/codemirror-vim";
import { completionKeymap, filterCompletionBindings } from "../keymap";

function hasEnterBinding(acceptOnEnter: boolean): boolean {
  const state = EditorState.create({
    extensions: [completionKeymap(acceptOnEnter)],
  });

  return state
    .facet(keymap)
    .flat()
    .some((binding) => binding.key === "Enter");
}

describe("completionKeymap", () => {
  it("upstream includes the macOS-only completion bindings we care about", () => {
    expect(
      defaultCompletionKeymap.some((binding) => binding.mac === "Alt-`"),
    ).toBe(true);
    expect(
      defaultCompletionKeymap.some((binding) => binding.mac === "Alt-i"),
    ).toBe(true);
  });

  it("removes Alt-backtick and Escape while keeping Alt-i", () => {
    const filtered = filterCompletionBindings(defaultCompletionKeymap);

    expect(filtered.some((binding) => binding.mac === "Alt-`")).toBe(false);
    expect(filtered.some((binding) => binding.key === "Escape")).toBe(false);
    expect(filtered.some((binding) => binding.mac === "Alt-i")).toBe(true);
  });

  it("includes Enter by default", () => {
    const filtered = filterCompletionBindings(defaultCompletionKeymap);
    expect(filtered.some((binding) => binding.key === "Enter")).toBe(true);
  });

  it("removes Enter when passed a keysToRemove set containing Enter", () => {
    const keysToRemove = new Set<string | undefined>([
      "Escape",
      "Alt-`",
      "Enter",
    ]);
    const filtered = filterCompletionBindings(
      defaultCompletionKeymap,
      keysToRemove,
    );
    expect(filtered.some((binding) => binding.key === "Enter")).toBe(false);
  });

  it("completionKeymap includes Enter when acceptOnEnter is true", () => {
    expect(hasEnterBinding(true)).toBe(true);
  });

  it("completionKeymap removes Enter when acceptOnEnter is false", () => {
    expect(hasEnterBinding(false)).toBe(false);
  });
});

describe("completion menu navigation", () => {
  const views: EditorView[] = [];

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.destroy();
    }
  });

  function createView(preset: Extension) {
    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          completionKeymap(),
          preset,
          autocompletion({
            override: [
              (context) => ({
                from: context.pos,
                options: [{ label: "alpha" }, { label: "beta" }],
              }),
            ],
            interactionDelay: 0,
          }),
        ],
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

  async function openCompletionMenu(view: EditorView) {
    startCompletion(view);
    await vi.waitFor(() =>
      expect(completionStatus(view.state)).toBe("active"),
    );
  }

  it("moves down and up the menu with Ctrl-n and Ctrl-p in vim", async () => {
    const view = createView(vim());
    press(view, "i");
    await openCompletionMenu(view);

    press(view, "n", { ctrlKey: true });
    expect(selectedCompletionIndex(view.state)).toBe(1);

    press(view, "p", { ctrlKey: true });
    expect(selectedCompletionIndex(view.state)).toBe(0);
  });

  it("leaves Ctrl-n and Ctrl-p unbound in the default preset", async () => {
    const view = createView([]);
    await openCompletionMenu(view);

    expect(press(view, "n", { ctrlKey: true })).toBe(false);
    expect(press(view, "p", { ctrlKey: true })).toBe(false);
    expect(selectedCompletionIndex(view.state)).toBe(0);
  });
});
