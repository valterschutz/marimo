/* Copyright 2026 Marimo. All rights reserved. */

import {
  EditorSelection,
  type Extension,
  findClusterBreak,
  Prec,
  type SelectionRange,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import { getIndentation, indentString } from "@codemirror/language";
import {
  type Command,
  Decoration,
  EditorView,
  type KeyBinding,
  keymap,
  runScopeHandlers,
  ViewPlugin,
} from "@codemirror/view";
import { commands, helix, readRegister, type TypableCommand } from "codemirror-helix";
import {
  focusCell,
  raf2,
  SCROLLOFF_LINES,
  type ViewAlignment,
} from "@/components/editor/navigation/focus-utils";
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

/** Whether the Helix engine is in select mode, extending its selection. */
export function isInHelixSelectMode(view: EditorView): boolean {
  const mode = view.dom.querySelector(".cm-hx-status-panel > span");
  return mode?.textContent === "SEL";
}

/**
 * Normal or select mode with no pending count, prefix (`g`, `m`, space) or
 * character argument (`f`, `t`, `r`), so `fx` still finds an `x`.
 *
 * The engine shows that pending state in its command panel; see
 * `isInHelixNormalMode` for why the DOM is read.
 */
export function isIdleInHelixNormalMode(view: EditorView): boolean {
  const pending = view.dom.querySelector(
    ".cm-hx-command-panel-flex > span:nth-child(2)",
  );
  return isInHelixNormalMode(view) && !pending?.textContent;
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
    hideUnfocusedSelectionTheme,
    helix({ config: { "editor.cursor-shape.insert": "bar" } }),
    commands.of(typableCommands()),
    focusedField,
    blockCursorOnlyWhileFocused,
    selectionMark,
    viewMode,
    longWordMotions,
    indentedOpenLine,
    linewisePaste,
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

const setViewPrefixEffect = StateEffect.define<boolean>();

/** Whether `z` was pressed and a view mode key is pending. */
const viewPrefixField = StateField.define<boolean>({
  create: () => false,
  update: (pending, tr) =>
    tr.effects.reduce((value, effect) => {
      if (effect.is(setViewPrefixEffect)) {
        return effect.value;
      }
      // A prefix doesn't outlive the editor's focus.
      return effect.is(setFocusedEffect) && !effect.value ? false : value;
    }, pending),
});

/** Where each view mode key puts the cursor line in the window. */
const VIEW_ALIGNMENTS: Partial<Record<string, ViewAlignment>> = {
  z: "center",
  c: "center",
  t: "start",
  b: "end",
};

/**
 * Helix's view mode alignments, which the engine lacks: `zz` and `zc` centre
 * the cursor line in the window, `zt` puts it at the top and `zb` at the
 * bottom. The window is whatever scrolls the editor, usually the notebook.
 *
 * Like Helix, the key after `z` is always consumed, so `z` followed by an
 * unbound key, Escape included, only cancels the prefix. Ahead of the engine
 * and every other keymap, so the key after `z` reaches nothing else.
 */
const viewMode: Extension = [
  viewPrefixField,
  Prec.highest(keymap.of([{ any: handleViewModeKey }])),
];

function handleViewModeKey(view: EditorView, event: KeyboardEvent): boolean {
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (!view.state.field(viewPrefixField)) {
    if (event.key !== "z" || hasModifier || !isIdleInHelixNormalMode(view)) {
      return false;
    }
    view.dispatch({ effects: setViewPrefixEffect.of(true) });
    return true;
  }
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
    return false;
  }
  const alignment = hasModifier ? undefined : VIEW_ALIGNMENTS[event.key];
  view.dispatch({
    effects: [
      setViewPrefixEffect.of(false),
      ...(alignment ? [alignCursorLine(view, alignment)] : []),
    ],
  });
  // Escape here only cancels the prefix, so the cell must not see it and
  // leave the editor.
  event.stopPropagation();
  return true;
}

function alignCursorLine(
  view: EditorView,
  alignment: ViewAlignment,
): StateEffect<unknown> {
  const { anchor, head } = view.state.selection.main;
  // The block cursor sits on the character before the head of a forward
  // range.
  const cursor = head > anchor ? head - 1 : head;
  return EditorView.scrollIntoView(cursor, {
    y: alignment,
    yMargin: SCROLLOFF_LINES * view.defaultLineHeight,
  });
}

/**
 * Helix's `W`, `B` and `E`, which the engine lacks: `W` and `E` move to the
 * start and end of the next WORD, `B` to the start of the previous one. A
 * WORD is a run of non-blank characters, wider than the engine's own `w`/
 * `b`/`e`, which also break on punctuation.
 *
 * `codemirror-helix` exports no word motions to extend, so this is a port of
 * its own `w`/`b`/`e`, whose shared implementation also treats `e` as a copy
 * of `w`. Engine and CodeMirror ranges both use Helix's gap-based anchor and
 * head; see `helix-personal-remaps.ts` for the same convention.
 */
const longWordMotions: Extension = keymap.of([
  { key: "W", run: (view) => moveByLongWord(view, true) },
  { key: "B", run: (view) => moveByLongWord(view, false) },
  { key: "E", run: (view) => moveByLongWord(view, true) },
]);

function moveByLongWord(view: EditorView, forward: boolean): boolean {
  if (!isInHelixNormalMode(view)) {
    return false;
  }
  const { selection } = view.state;
  const extend = isInHelixSelectMode(view);
  view.dispatch({
    selection: EditorSelection.create(
      selection.ranges.map((range) =>
        moveRangeByLongWord(view, range, forward, extend),
      ),
      selection.mainIndex,
    ),
    scrollIntoView: true,
  });
  return true;
}

/** Whether `range` is already a single character wide, like a block cursor. */
function isLongWordRangeAtomic(doc: Text, range: SelectionRange): boolean {
  return (
    range.empty || longWordClusterBreak(doc, range.from, true) === range.to
  );
}

function moveRangeByLongWord(
  view: EditorView,
  range: SelectionRange,
  forward: boolean,
  extend: boolean,
): SelectionRange {
  const doc = view.state.doc;
  const rangeForward = isLongWordRangeForward(doc, range);
  const atomic = isLongWordRangeAtomic(doc, range);
  const headCursor = atomic
    ? range
    : EditorSelection.range(
        longWordClusterBreak(doc, range.head, !rangeForward),
        range.head,
      );
  const anchorCursor = atomic
    ? range
    : EditorSelection.range(
        range.anchor,
        longWordClusterBreak(doc, range.anchor, rangeForward),
      );
  let nextAnchor = forward ? headCursor.from : headCursor.to;
  let nextHead = moveByLongWordGroup(view, nextAnchor, forward);
  const oldEnd = forward ? headCursor.to : headCursor.from;
  if (nextHead === oldEnd) {
    nextAnchor = nextHead;
    nextHead = moveByLongWordGroup(view, nextAnchor, forward);
  }
  const nextRange = EditorSelection.range(nextAnchor, nextHead);
  if (!extend) {
    return nextRange;
  }
  const nextHeadCursor = isLongWordRangeAtomic(doc, nextRange)
    ? nextRange
    : EditorSelection.range(
        longWordClusterBreak(doc, nextRange.head, !forward),
        nextRange.head,
      );
  return nextHeadCursor.to < anchorCursor.from
    ? EditorSelection.range(anchorCursor.to, nextHeadCursor.from)
    : EditorSelection.range(anchorCursor.from, nextHeadCursor.to);
}

/**
 * Indent the line `o` and `O` open, as Helix does; the engine's own commands
 * insert a bare line break. The engine still opens the line, so its undo
 * checkpoint and switch to insert mode are kept, and the new line then gets
 * the language's indentation, or the indentation of the line it was opened
 * from when the language has no opinion.
 */
const indentedOpenLine: Extension = Prec.high(
  keymap.of([
    { key: "o", run: (view) => openIndentedLine(view, "o") },
    { key: "O", run: (view) => openIndentedLine(view, "O") },
  ]),
);

/** Set while the engine's own `o`/`O` runs, so it is not wrapped again. */
let openingLine = false;

function openIndentedLine(view: EditorView, key: "o" | "O"): boolean {
  if (openingLine || !isIdleInHelixNormalMode(view)) {
    return false;
  }
  const doc = view.state.doc;
  openingLine = true;
  try {
    runHelixKey(view, key);
  } finally {
    openingLine = false;
  }
  if (view.state.doc === doc) {
    return true;
  }
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const column = getIndentation(view.state, head);
  const sourceLine = view.state.doc.line(
    key === "o" ? line.number - 1 : line.number + 1,
  );
  const indent =
    column === null
      ? sourceLine.text.slice(
          0,
          sourceLine.text.length - sourceLine.text.trimStart().length,
        )
      : indentString(view.state, column);
  view.dispatch({
    changes: { from: head, insert: indent },
    selection: EditorSelection.cursor(head + indent.length),
  });
  return true;
}

/** Helix's direction for a range; a one-character cursor is forward. */
function isLongWordRangeForward(doc: Text, range: SelectionRange): boolean {
  return (
    range.head > range.from ||
    longWordClusterBreak(doc, range.from, true) >= range.to
  );
}

function moveByLongWordGroup(
  view: EditorView,
  pos: number,
  forward: boolean,
): number {
  return view.moveByChar(EditorSelection.cursor(pos), forward, byLongWord).head;
}

/**
 * A WORD boundary predicate for `EditorView.moveByChar`: a run of blank
 * characters (crossed as `\n` between lines) followed by a run of non-blank
 * ones is a single group, unlike the engine's own word/punctuation/blank
 * categories.
 */
function byLongWord(initial: string): (next: string) => boolean {
  let blank = /\s/.test(initial);
  return (next) => {
    const nextBlank = /\s/.test(next);
    if (blank) {
      blank = nextBlank;
    }
    return blank === nextBlank;
  };
}

/** Like `findClusterBreak`, across line breaks of a whole document. */
export function longWordClusterBreak(doc: Text, pos: number, forward: boolean): number {
  if (forward ? pos >= doc.length : pos <= 0) {
    return pos;
  }
  const line = doc.lineAt(pos);
  if (pos === (forward ? line.to : line.from)) {
    return forward ? pos + 1 : pos - 1;
  }
  return line.from + findClusterBreak(line.text, pos - line.from, forward);
}

/** A line's start position, or the document's end past its last line. */
function lineStart(doc: Text, lineNumber: number): number {
  return lineNumber > doc.lines ? doc.length : doc.line(lineNumber).from;
}

/**
 * Whether `range` runs from a line's start to the start of the line after
 * it, or to the document's end for the last line, as `extend_line` (`x`)
 * builds it.
 */
export function isWholeLineRange(doc: Text, range: SelectionRange): boolean {
  const startLine = doc.lineAt(range.from).number;
  const endLine = doc.lineAt(
    range.empty
      ? range.to
      : Math.max(range.from, longWordClusterBreak(doc, range.to, false)),
  ).number;
  return (
    range.from === lineStart(doc, startLine) &&
    range.to === lineStart(doc, endLine + 1)
  );
}

const DEFAULT_REGISTER_KEY = "";

/** The register named by a pending `"<char>` prefix, or the default register. */
function activeRegisterName(view: EditorView): string {
  const registerSpan = view.dom.querySelector(
    ".cm-hx-status-panel > span:nth-child(2)",
  );
  const text = registerSpan?.textContent ?? "";
  return text.startsWith("reg=") ? text.slice(4) : DEFAULT_REGISTER_KEY;
}

const setLinewiseYank = StateEffect.define<readonly string[]>();

/**
 * The default register's content, once last yanked from a selection where
 * every range was a whole-line range. `codemirror-helix` has no linewise
 * register concept and exports no way to write its own registers, so this
 * tracks it on the side, for the default (unnamed) register only: `y`
 * stashes the content it is about to yank here before letting the engine's
 * own `y` run, and `p`/`P` below trust the stash only while the register's
 * live content (the one thing `readRegister` can read) still matches it
 * exactly. See `docs/adr/0001-linewise-paste-side-channel.md`.
 */
const linewiseRegisterField = StateField.define<readonly string[] | undefined>({
  create: () => undefined,
  update(stashed, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLinewiseYank)) {
        stashed = effect.value;
      }
    }
    return stashed;
  },
});

/**
 * Stash the selection's content before a whole-line `y`, so `p`/`P` can
 * later paste it as a new line even on a cell's last line, which has no
 * trailing newline of its own to carry. Never prevents the engine's own `y`,
 * which still runs immediately after and writes its register as usual.
 */
function handleLinewiseYank(view: EditorView): boolean {
  if (!isIdleInHelixNormalMode(view)) {
    return false;
  }
  if (activeRegisterName(view) !== DEFAULT_REGISTER_KEY) {
    return false;
  }
  const { doc, selection } = view.state;
  if (!selection.ranges.every((range) => isWholeLineRange(doc, range))) {
    return false;
  }
  view.dispatch({
    effects: setLinewiseYank.of(
      selection.ranges.map((range) => doc.sliceString(range.from, range.to)),
    ),
  });
  return false;
}

/** Whether two readings of a register's content are the same text. */
function registerContentMatches(
  live: readonly (string | Text)[],
  stashed: readonly string[],
): boolean {
  return (
    live.length === stashed.length &&
    live.every((value, i) => value.toString() === stashed[i])
  );
}

/**
 * The stashed linewise content for the active register, but only once its
 * live content (read back through the one export that allows it) still
 * matches exactly, proving nothing has overwritten the register since.
 */
function stashedLinewiseContent(view: EditorView): readonly string[] | undefined {
  if (activeRegisterName(view) !== DEFAULT_REGISTER_KEY) {
    return undefined;
  }
  const stashed = view.state.field(linewiseRegisterField);
  if (!stashed) {
    return undefined;
  }
  // `readRegister`'s declared type is `string`, but only `undefined` (never
  // `""`) triggers its default-register fallback; this passes the one value
  // its type forbids but its implementation requires.
  const live = readRegister(view.state, undefined as unknown as string);
  return live && registerContentMatches(live, stashed) ? stashed : undefined;
}

/** Repeat or truncate yanked content to match the number of paste ranges. */
function fanOutLinewiseContent(
  rangeCount: number,
  content: readonly string[],
): string[] {
  if (rangeCount <= content.length) {
    return content.slice(0, rangeCount);
  }
  const last = content.at(-1) ?? "";
  return Array.from({ length: rangeCount }, (_, i) => content[i] ?? last);
}

/**
 * Where a linewise paste inserts: `p` always lands below the *whole* line
 * the selection touches, `P` above it, regardless of which column within
 * that line the selection sits at. A whole-line range (built by `x`) is
 * already bounded exactly there, so this is a no-op for it; it only
 * matters for a plain cursor or a partial selection left after `y`.
 */
function linewisePastePosition(
  doc: Text,
  range: SelectionRange,
  before: boolean,
): number {
  if (before) {
    const touched = range.empty ? range.head : range.from;
    return doc.lineAt(touched).from;
  }
  const touched = range.empty ? range.head : range.to - 1;
  return lineStart(doc, doc.lineAt(touched).number + 1);
}

/**
 * A whole line to insert at `pos`, with a synthetic newline added on
 * whichever side `pos` doesn't already border one. The common case (`pos`
 * sits between two existing lines) needs neither: the source line's own
 * trailing newline, stripped and never relied on here, already separated it
 * from what follows. Only a cell's first or last line, which has no
 * newline on the outward side, needs one synthesized.
 */
function linewiseInsertion(doc: Text, pos: number, lineText: string): string {
  const pureLine = lineText.endsWith("\n") ? lineText.slice(0, -1) : lineText;
  const leading = pos > 0 && doc.sliceString(pos - 1, pos) !== "\n";
  const trailing = pos < doc.length;
  return (leading ? "\n" : "") + pureLine + (trailing ? "\n" : "");
}

function pasteLinewise(
  view: EditorView,
  content: readonly string[],
  before: boolean,
): void {
  const { doc, selection } = view.state;
  const yanks = fanOutLinewiseContent(selection.ranges.length, content);
  const positions = selection.ranges.map((range) =>
    linewisePastePosition(doc, range, before),
  );
  const inserts = positions.map((pos, i) => linewiseInsertion(doc, pos, yanks[i]));
  const specs = positions.map((pos, i) => ({ from: pos, insert: inserts[i] }));
  let offset = 0;
  const ranges = positions.map((pos, i) => {
    const anchor = pos + offset;
    offset += inserts[i].length;
    return EditorSelection.range(anchor, anchor + inserts[i].length);
  });
  view.dispatch({
    changes: view.state.changes(specs),
    selection: EditorSelection.create(ranges, selection.mainIndex),
  });
}

/**
 * Paste the active register's content as a new line when it was linewise
 * and is still live (see `stashedLinewiseContent`); otherwise defer to the
 * engine's own characterwise `p`/`P`.
 */
function handleLinewisePaste(view: EditorView, before: boolean): boolean {
  if (!isIdleInHelixNormalMode(view)) {
    return false;
  }
  const content = stashedLinewiseContent(view);
  if (!content) {
    return false;
  }
  pasteLinewise(view, content, before);
  return true;
}

/**
 * Linewise registers: `y` on a whole-line selection stashes what it yanked,
 * and `p`/`P` paste it as a new line, synthesizing the newline the engine's
 * purely characterwise commands never would. Unnamed register only; see
 * `docs/adr/0001-linewise-paste-side-channel.md` for the named-register and
 * count-prefix (`3p`) cuts.
 */
const linewisePaste: Extension = [
  linewiseRegisterField,
  Prec.high(
    keymap.of([
      { key: "y", run: handleLinewiseYank },
      { key: "p", run: (view) => handleLinewisePaste(view, false) },
      { key: "P", run: (view) => handleLinewisePaste(view, true) },
    ]),
  ),
];

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
  // bottom panels keep it. CodeMirror reads the container's position as a
  // bottom scroll margin, so it must stay laid out right under the text: a
  // `display: none` container reports the top of the viewport, and a sticky
  // one can stick above the window's bottom edge, and either makes scrolling
  // into view overshoot. No commas: `EditorView.theme` splits selectors on
  // them, even inside `:not()`.
  ".cm-panels-bottom:not(:has(> :not(.cm-hx-status-panel):not(.cm-hx-command-panel))):not(:has(.cm-hx-command-input))":
    {
      borderTopWidth: "0",
      position: "static",
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
/**
 * Hide CodeMirror's selection band while the editor is unfocused, like the
 * block cursor and selection marks. CodeMirror only dims it, which leaves a
 * box on the first character of every cell from the engine's mount-time
 * cursor selection.
 */
const hideUnfocusedSelectionTheme = EditorView.theme({
  "&:not(.cm-focused) .cm-selectionLayer": {
    display: "none",
  },
});

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
