/* Copyright 2026 Marimo. All rights reserved. */

import {
  EditorSelection,
  EditorState,
  type Extension,
} from "@codemirror/state";
import { EditorView, runScopeHandlers, showPanel } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { aiExtension } from "@marimo-team/codemirror-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { darkTheme } from "../../theme/dark";
import { lightTheme } from "../../theme/light";
import {
  helixExtension,
  hideAiEditTriggerInHelixNormalMode,
  isInHelixNormalMode,
  setHelixMode,
} from "../helix";

const views: EditorView[] = [];

function createView(doc: string, extensions: Extension = []) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [helixExtension(), extensions],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

/** Focus or blur the editor and wait for CodeMirror to apply the change. */
async function setFocus(view: EditorView, focused: boolean) {
  if (focused) {
    view.focus();
  } else {
    view.contentDOM.blur();
  }
  await vi.waitFor(() =>
    expect(view.dom.classList.contains("cm-focused")).toBe(focused),
  );
}

async function createFocusedView(doc: string, extensions: Extension = []) {
  const view = createView(doc, extensions);
  await setFocus(view, true);
  return view;
}

function press(view: EditorView, key: string, init?: KeyboardEventInit) {
  runScopeHandlers(
    view,
    new KeyboardEvent("keydown", { key, ...init }),
    "editor",
  );
}

/**
 * Whether the bottom panels' container is collapsed: laid out in the flow
 * under the text, since CodeMirror measures its position for scroll margins,
 * but without a border.
 */
function isPanelContainerCollapsed(view: EditorView) {
  const container = view.dom.querySelector(".cm-panels-bottom");
  if (!container) {
    throw new Error(".cm-panels-bottom not mounted");
  }
  const style = getComputedStyle(container);
  return (
    style.display !== "none" &&
    style.position === "static" &&
    style.borderTopWidth === "0px"
  );
}

/** Whether the element matching `selector` is hidden by a stylesheet. */
function isHidden(view: EditorView, selector: string) {
  const element = view.dom.querySelector(selector);
  if (!element) {
    throw new Error(`${selector} not mounted`);
  }
  return getComputedStyle(element).display === "none";
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

describe("setHelixMode", () => {
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

describe("hideAiEditTriggerInHelixNormalMode", () => {
  const withAiEditTrigger = () => [
    aiExtension({ prompt: async () => "" }),
    hideAiEditTriggerInHelixNormalMode(),
  ];

  it("hides the trigger after a normal-mode motion", () => {
    const view = createView("print(1)", withAiEditTrigger());
    expect(isInHelixNormalMode(view)).toBe(true);

    press(view, "l");
    expect(view.state.selection.main.empty).toBe(false);
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(true);
  });

  it("shows the trigger for an insert-mode selection", () => {
    const view = createView("print(1)", withAiEditTrigger());
    press(view, "i");

    view.dispatch({ selection: EditorSelection.range(0, 5) });
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(false);
  });

  it("hides the trigger again when Escape returns to normal mode", () => {
    const view = createView("print(1)", withAiEditTrigger());
    press(view, "i");
    view.dispatch({ selection: EditorSelection.range(0, 5) });
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(false);

    press(view, "Escape");
    expect(isInHelixNormalMode(view)).toBe(true);
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(true);
  });

  it("shows the trigger for a pointer selection in normal mode", () => {
    const view = createView("print(1)", withAiEditTrigger());
    press(view, "l");
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(true);

    view.dispatch({
      selection: EditorSelection.range(0, 5),
      userEvent: "select.pointer",
    });
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(false);

    // The next motion is keyboard-driven again.
    press(view, "l");
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(true);
  });

  it("keeps the trigger hidden across focus changes", () => {
    const view = createView("print(1)", withAiEditTrigger());
    press(view, "l");

    view.contentDOM.dispatchEvent(new FocusEvent("focus"));
    view.contentDOM.dispatchEvent(new FocusEvent("blur"));
    expect(isHidden(view, ".cm-ai-tooltip-button")).toBe(true);
  });
});

describe("helixExtension chrome", () => {
  it("hides the statusline in every editor mode but keeps it mounted", () => {
    const view = createView("print(1)");
    expect(isHidden(view, ".cm-hx-status-panel")).toBe(true);

    press(view, "v");
    expect(isHidden(view, ".cm-hx-status-panel")).toBe(true);

    press(view, "Escape");
    press(view, "i");
    expect(isInHelixNormalMode(view)).toBe(false);
    expect(isHidden(view, ".cm-hx-status-panel")).toBe(true);

    press(view, "Escape");
    expect(isInHelixNormalMode(view)).toBe(true);
  });

  it("collapses the command panel unless a prompt is open", () => {
    const view = createView("print(1)");
    // The panels' container too, which would otherwise keep its border.
    expect(isPanelContainerCollapsed(view)).toBe(true);
    expect(isHidden(view, ".cm-hx-command-panel")).toBe(true);

    press(view, ":");
    expect(isPanelContainerCollapsed(view)).toBe(false);
    expect(isHidden(view, ".cm-hx-command-panel")).toBe(false);

    const input = view.dom.querySelector("input");
    input?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(view.dom.querySelector("input")).toBeNull();
    expect(isPanelContainerCollapsed(view)).toBe(true);
    expect(isHidden(view, ".cm-hx-command-panel")).toBe(true);
  });

  it("keeps other bottom panels visible", () => {
    const view = createView("print(1)", [
      showPanel.of(() => ({ dom: document.createElement("div"), top: false })),
    ]);
    expect(isPanelContainerCollapsed(view)).toBe(false);
    expect(isHidden(view, ".cm-hx-command-panel")).toBe(true);
  });

  it("opens the command panel for a search prompt", () => {
    const view = createView("print(1)");
    press(view, "/");
    expect(isHidden(view, ".cm-hx-command-panel")).toBe(false);
  });

  it("keeps the command panel collapsed while a prefix is pending", () => {
    const view = createView("print(1)");
    press(view, "g");
    expect(
      view.dom.querySelector(".cm-hx-command-panel")?.textContent,
    ).not.toBe("");
    expect(isHidden(view, ".cm-hx-command-panel")).toBe(true);
  });
});

describe("helixExtension block cursor", () => {
  function createHighlightedView(doc: string, theme: Extension) {
    return createFocusedView(doc, [
      python(),
      syntaxHighlighting(defaultHighlightStyle),
      theme,
    ]);
  }

  function cursor(view: EditorView) {
    const mark = view.contentDOM.querySelector(".cm-hx-cursor");
    if (!mark) {
      throw new Error("Block cursor not drawn");
    }
    return mark;
  }

  /**
   * A computed colour with `var()` resolved, which jsdom leaves unresolved.
   */
  function resolvedColor(element: Element, property: string): string {
    const value = getComputedStyle(element).getPropertyValue(property);
    const match = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(value);
    if (!match) {
      return value;
    }
    const [, name, fallback] = match;
    for (let el: Element | null = element; el; el = el.parentElement) {
      const declared = getComputedStyle(el).getPropertyValue(name).trim();
      if (declared) {
        return declared;
      }
    }
    return fallback ?? "";
  }

  it.each([
    { name: "light", theme: lightTheme, caret: "#000000" },
    { name: "dark", theme: darkTheme, caret: "#528bff" },
  ])("uses the $name theme's caret colour", async ({ theme, caret }) => {
    const view = await createHighlightedView("print(1)", theme);
    expect(resolvedColor(cursor(view), "background-color")).toBe(caret);
  });

  it("can be recoloured by a custom theme", async () => {
    const view = await createHighlightedView(
      "print(1)",
      EditorView.theme({
        "&": { "--cm-caret-color": "#89b4fa", "--cm-background": "#1e1e2e" },
      }),
    );
    expect(resolvedColor(cursor(view), "background-color")).toBe("#89b4fa");
  });

  it("inverts the character under it, syntax tokens included", async () => {
    // The cursor starts on `1`, a highlighted number token.
    const view = await createHighlightedView(
      "1 + 2",
      EditorView.theme({ "&": { "--cm-background": "#1e1e2e" } }),
    );
    const mark = cursor(view);
    const token = mark.querySelector("span");
    if (!token) {
      throw new Error("No syntax token inside the block cursor");
    }
    expect(resolvedColor(mark, "color")).toBe("#1e1e2e");
    expect(resolvedColor(token, "color")).toBe("#1e1e2e");
  });

  it("is not drawn while the editor is unfocused", () => {
    const view = createView("print(1)", lightTheme);
    expect(resolvedColor(cursor(view), "background-color")).toBe(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("is drawn only while the editor has focus", async () => {
    const view = await createHighlightedView("print(1)", lightTheme);
    await setFocus(view, false);
    expect(resolvedColor(cursor(view), "background-color")).toBe(
      "rgba(0, 0, 0, 0)",
    );
    await setFocus(view, true);
    expect(resolvedColor(cursor(view), "background-color")).toBe("#000000");
  });
});

describe("helixExtension selection mark", () => {
  /** Text inside `element`, without the engine's end-of-line cursor widget. */
  function documentText(element: Element): string {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest(".cm-hx-cursor-endline")) {
        text += node.textContent;
      }
    }
    return text;
  }

  /** The marked document text of each line, skipping lines without any. */
  function markedText(view: EditorView): string[] {
    return [...view.contentDOM.querySelectorAll(".cm-line")]
      .map((line) =>
        [...line.querySelectorAll(".cm-hx-selection")]
          .map(documentText)
          .join(""),
      )
      .filter(Boolean);
  }

  const doc = "a = 1\nb = 2\nc = 3\nd = 4";

  it("marks the line selected by x", async () => {
    const view = await createFocusedView(doc);
    press(view, "x");
    expect(markedText(view)).toEqual(["a = 1"]);
  });

  it("marks a multi-line selection", async () => {
    const view = await createFocusedView(doc);
    press(view, "x");
    press(view, "x");
    press(view, "x");
    expect(markedText(view)).toEqual(["a = 1", "b = 2", "c = 3"]);
  });

  it("marks a multi-line selection extended in editor select mode", async () => {
    const view = await createFocusedView(doc);
    press(view, "l");
    press(view, "v");
    // Goto last line; only editor select mode keeps the anchor on line 1.
    press(view, "g");
    press(view, "e");
    expect(markedText(view)).toEqual([" = 1", "b = 2", "c = 3", "d"]);
  });

  it("marks every range of a multi-cursor selection", async () => {
    const view = await createFocusedView(doc);
    press(view, "x");
    press(view, "x");
    press(view, "s", { altKey: true });
    expect(view.state.selection.ranges).toHaveLength(2);
    expect(markedText(view)).toEqual(["a = 1", "b = 2"]);
  });

  it("marks a pointer selection", async () => {
    const view = await createFocusedView(doc);
    view.dispatch({
      selection: EditorSelection.range(6, 11),
      userEvent: "select.pointer",
    });
    expect(markedText(view)).toEqual(["b = 2"]);
  });

  it("marks nothing for a collapsed cursor in editor insert mode", async () => {
    const view = await createFocusedView(doc);
    press(view, "i");
    view.dispatch({ selection: EditorSelection.cursor(2) });
    expect(isInHelixNormalMode(view)).toBe(false);
    expect(markedText(view)).toEqual([]);
  });

  it.each([
    { name: "light", theme: lightTheme },
    { name: "dark", theme: darkTheme },
  ])("has no styling of its own in the $name theme", async ({ theme }) => {
    const view = await createFocusedView(doc, theme);
    view.dispatch({ selection: EditorSelection.range(6, 11) });
    const mark = view.contentDOM.querySelector(".cm-hx-selection");
    if (!mark?.parentElement) {
      throw new Error("Selection not marked");
    }
    const style = getComputedStyle(mark);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.color).toBe(getComputedStyle(mark.parentElement).color);
  });

  it("marks nothing while the editor is unfocused", () => {
    const view = createView(doc);
    press(view, "x");
    expect(markedText(view)).toEqual([]);
  });

  it("marks the kept selection again when the editor is refocused", async () => {
    const view = await createFocusedView(doc);
    press(view, "x");
    await setFocus(view, false);
    expect(markedText(view)).toEqual([]);
    await setFocus(view, true);
    expect(markedText(view)).toEqual(["a = 1"]);
  });
});

describe("helixExtension selection band", () => {
  function selectionLayer(view: EditorView) {
    const layer = view.dom.querySelector(".cm-selectionLayer");
    if (!layer) {
      throw new Error("Selection layer not mounted");
    }
    return layer;
  }

  it("is not drawn while the editor is unfocused", () => {
    const view = createView("print(1)");
    expect(getComputedStyle(selectionLayer(view)).display).toBe("none");
  });

  it("is drawn again when the editor is refocused", async () => {
    const view = await createFocusedView("print(1)");
    expect(getComputedStyle(selectionLayer(view)).display).not.toBe("none");
    await setFocus(view, false);
    expect(getComputedStyle(selectionLayer(view)).display).toBe("none");
    await setFocus(view, true);
    expect(getComputedStyle(selectionLayer(view)).display).not.toBe("none");
  });
});

describe("helixExtension view mode", () => {
  const doc = "a = 1\nb = 2\nc = 3";
  const lineB = doc.indexOf("b");

  /** Puts the block cursor on the first character of line `b`. */
  async function createViewOnLineB() {
    const view = await createFocusedView(doc);
    view.dispatch({ selection: EditorSelection.single(lineB, lineB + 1) });
    return view;
  }

  function spyOnScrollIntoView() {
    return vi.spyOn(EditorView, "scrollIntoView");
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["z", "center"],
    ["c", "center"],
    ["t", "start"],
    ["b", "end"],
  ])("z%s aligns the cursor line to the %s", async (key, y) => {
    const view = await createViewOnLineB();
    const scrollIntoView = spyOnScrollIntoView();

    press(view, "z");
    expect(scrollIntoView).not.toHaveBeenCalled();
    press(view, key);

    expect(scrollIntoView).toHaveBeenCalledWith(
      lineB,
      expect.objectContaining({ y }),
    );
    expect(view.state.selection.main.from).toBe(lineB);
  });

  it("aligns in editor select mode", async () => {
    const view = await createViewOnLineB();
    press(view, "v");
    const scrollIntoView = spyOnScrollIntoView();

    press(view, "z");
    press(view, "t");

    expect(scrollIntoView).toHaveBeenCalledWith(
      lineB,
      expect.objectContaining({ y: "start" }),
    );
  });

  it("consumes the key after z, even an unbound one", async () => {
    const view = await createViewOnLineB();
    const scrollIntoView = spyOnScrollIntoView();

    press(view, "z");
    press(view, "i");

    expect(isInHelixNormalMode(view)).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // The prefix is gone, so the next key acts normally.
    press(view, "i");
    expect(isInHelixNormalMode(view)).toBe(false);
  });

  it("cancels the prefix on Escape without leaving the editor", async () => {
    const view = await createViewOnLineB();
    press(view, "z");
    const escape = new KeyboardEvent("keydown", { key: "Escape" });

    runScopeHandlers(view, escape, "editor");

    expect(escape.cancelBubble).toBe(true);
    const scrollIntoView = spyOnScrollIntoView();
    press(view, "z");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("drops the prefix when the editor loses focus", async () => {
    const view = await createViewOnLineB();
    press(view, "z");
    await setFocus(view, false);
    await setFocus(view, true);
    const scrollIntoView = spyOnScrollIntoView();

    press(view, "z");

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves z to character arguments such as f", async () => {
    const view = await createViewOnLineB();

    press(view, "f");

    // The engine reads the character from text input, so the keydown must
    // stay unhandled.
    expect(
      runScopeHandlers(
        view,
        new KeyboardEvent("keydown", { key: "z" }),
        "editor",
      ),
    ).toBe(false);
  });

  it("leaves z alone in editor insert mode", async () => {
    const view = await createViewOnLineB();
    setHelixMode(view, "insert");

    expect(
      runScopeHandlers(
        view,
        new KeyboardEvent("keydown", { key: "z" }),
        "editor",
      ),
    ).toBe(false);
  });
});

describe("helixExtension long word motions", () => {
  function text(view: EditorView) {
    return view.state.doc.toString();
  }

  function cursor(view: EditorView) {
    return view.state.selection.main.head > view.state.selection.main.anchor
      ? view.state.selection.main.head - 1
      : view.state.selection.main.head;
  }

  it("W moves to the end of a WORD, punctuation included", async () => {
    const view = await createFocusedView("foo.bar() baz");
    press(view, "W");
    expect(cursor(view)).toBe(text(view).indexOf(")"));
  });

  it("W from inside a WORD still lands on its end", async () => {
    const view = await createFocusedView("foo.bar() baz");
    view.dispatch({ selection: EditorSelection.cursor(1) });
    press(view, "W");
    expect(cursor(view)).toBe(text(view).indexOf(")"));
  });

  it("a second W reaches the following WORD", async () => {
    const view = await createFocusedView("foo.bar() baz");
    press(view, "W");
    press(view, "W");
    expect(cursor(view)).toBe(text(view).length - 1);
  });

  it("W crosses line breaks", async () => {
    const view = await createFocusedView("foo\nbar");
    press(view, "W");
    press(view, "W");
    expect(cursor(view)).toBe(text(view).length - 1);
  });

  it("E moves to the end of the current WORD", async () => {
    const view = await createFocusedView("foo.bar() baz");
    press(view, "E");
    expect(cursor(view)).toBe(text(view).indexOf(")"));
  });

  it("B moves to the start of the previous WORD", async () => {
    const view = await createFocusedView("foo.bar() baz");
    view.dispatch({ selection: EditorSelection.cursor(text(view).length) });
    press(view, "B");
    expect(cursor(view)).toBe(text(view).indexOf("baz"));
  });

  it("extends the selection in select mode", async () => {
    const view = await createFocusedView("foo.bar() baz");
    press(view, "v");
    press(view, "W");
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(text(view).indexOf(")") + 1);
  });

  it("moves every range of a multi-cursor selection", async () => {
    const view = await createFocusedView("foo bar\nbaz qux");
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(8),
      ]),
    });
    press(view, "W");
    expect(
      view.state.selection.ranges.map((range) =>
        range.head > range.anchor ? range.head - 1 : range.head,
      ),
    ).toEqual([text(view).indexOf("foo") + 2, text(view).indexOf("baz") + 2]);
  });

  it("leaves W, B and E to self-insertion in editor insert mode", async () => {
    const view = await createFocusedView("foo");
    setHelixMode(view, "insert");

    for (const key of ["W", "B", "E"]) {
      expect(
        runScopeHandlers(view, new KeyboardEvent("keydown", { key }), "editor"),
      ).toBe(false);
    }
  });
});
