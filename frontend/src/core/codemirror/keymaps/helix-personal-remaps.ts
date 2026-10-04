/* Copyright 2026 Marimo. All rights reserved. */

// Personal configuration for this fork, not for upstream: the Helix remaps
// from the maintainer's `config.toml`, layered over the engine.
//
//   x = "extend_line"
//   G = "goto_file_end"
//   _ = "goto_word"
//   - = "trim_selections"
//
// `codemirror-helix` has no keymap config and exports none of its commands,
// so each one is a port of the Helix command of the same name. Engine and
// CodeMirror ranges both use Helix's gap-based anchor and head.

import {
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
  type SelectionRange,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type KeyBinding,
  keymap,
  WidgetType,
} from "@codemirror/view";
import {
  isIdleInHelixNormalMode,
  isInHelixSelectMode,
  longWordClusterBreak as clusterBreak,
} from "./helix";

export function helixPersonalRemaps(): Extension {
  return [
    // Above the engine's own `x` and `_`
    Prec.high(keymap.of(remapBindings())),
    // While labels are shown every key belongs to the jump
    Prec.highest(EditorView.domEventHandlers({ keydown: handleJumpLabelKey })),
    jumpLabelsField,
    jumpLabelTheme,
  ];
}

function remapBindings(): KeyBinding[] {
  const bindings: Record<string, (view: EditorView) => void> = {
    x: extendLine,
    G: gotoFileEnd,
    _: gotoWord,
    "-": trimSelections,
  };
  return Object.entries(bindings).map(([key, command]) => ({
    key,
    run: (view) => {
      if (!isIdleInHelixNormalMode(view)) {
        return false;
      }
      command(view);
      return true;
    },
  }));
}

/**
 * Helix's direction for a range. The engine stores a one-character cursor
 * as a backward range, which Helix treats as forward.
 */
function isForward(doc: Text, range: SelectionRange): boolean {
  return (
    range.head > range.from || clusterBreak(doc, range.from, true) >= range.to
  );
}

/**
 * Select the lines under each range, or extend by one line in the direction
 * of the primary range when they are already selected.
 */
function extendLine(view: EditorView): void {
  const { doc, selection } = view.state;
  const below = isForward(doc, selection.main);
  const lineStart = (lineNumber: number) =>
    lineNumber > doc.lines ? doc.length : doc.line(lineNumber).from;
  view.dispatch({
    selection: EditorSelection.create(
      selection.ranges.map((range) => {
        const startLine = doc.lineAt(range.from).number;
        const endLine = doc.lineAt(
          range.empty
            ? range.to
            : Math.max(range.from, clusterBreak(doc, range.to, false)),
        ).number;
        const start = lineStart(startLine);
        const end = lineStart(endLine + 1);
        const isLineSelection = range.from === start && range.to === end;
        if (below) {
          return EditorSelection.range(
            start,
            isLineSelection ? lineStart(endLine + 2) : end,
          );
        }
        return EditorSelection.range(
          end,
          isLineSelection ? lineStart(Math.max(1, startLine - 1)) : start,
        );
      }),
      selection.mainIndex,
    ),
    scrollIntoView: true,
  });
}

/** Move to the end of the cell, or extend to it in select mode. */
function gotoFileEnd(view: EditorView): void {
  const { doc, selection } = view.state;
  const end = doc.length;
  if (!isInHelixSelectMode(view)) {
    view.dispatch({
      selection: EditorSelection.cursor(end),
      scrollIntoView: true,
    });
    return;
  }
  view.dispatch({
    selection: EditorSelection.create(
      selection.ranges.map((range) =>
        EditorSelection.range(
          // A backward range's anchor sits after its last character
          isForward(doc, range)
            ? range.from
            : clusterBreak(doc, range.anchor, false),
          end,
        ),
      ),
      selection.mainIndex,
    ),
    scrollIntoView: true,
  });
}

/**
 * Trim whitespace from both ends of each range, dropping whitespace-only
 * ranges. If none are left, collapse to the primary cursor.
 */
function trimSelections(view: EditorView): void {
  const { doc, selection } = view.state;
  const trimmed = selection.ranges.flatMap((range) => {
    const text = doc.sliceString(range.from, range.to);
    if (!text.trim()) {
      return [];
    }
    const from = range.from + (text.length - text.trimStart().length);
    const to = range.to - (text.length - text.trimEnd().length);
    if (from === range.from && to === range.to) {
      return [range];
    }
    return [
      isForward(doc, range)
        ? EditorSelection.range(from, to)
        : EditorSelection.range(to, from),
    ];
  });
  if (trimmed.length > 0) {
    const { main } = selection;
    const mainIndex = trimmed.findIndex(
      (range) =>
        range.from === main.from ||
        (range.to > main.from && main.to > range.from),
    );
    view.dispatch({
      selection: EditorSelection.create(
        trimmed,
        mainIndex === -1 ? trimmed.length - 1 : mainIndex,
      ),
    });
    return;
  }
  const cursor = blockCursor(doc, selection.main);
  view.dispatch({
    // The engine's own representation of a one-character cursor
    selection: EditorSelection.range(clusterBreak(doc, cursor, true), cursor),
  });
}

/** The character the engine draws the block cursor on. */
function blockCursor(doc: Text, range: SelectionRange): number {
  return range.head > range.from
    ? clusterBreak(doc, range.head, false)
    : range.head;
}

const JUMP_LABEL_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

interface Word {
  from: number;
  to: number;
}

interface JumpLabels {
  /** Jump targets in label order. */
  words: readonly Word[];
  decorations: DecorationSet;
  /** Index of the first label character typed, once it has been. */
  first?: number;
}

const setJumpLabels = StateEffect.define<JumpLabels | null>();

const jumpLabelsField = StateField.define<JumpLabels | null>({
  create: () => null,
  update(labels, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setJumpLabels)) {
        return effect.value;
      }
    }
    return tr.docChanged || tr.selection ? null : labels;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (labels) =>
      labels ? labels.decorations : Decoration.none,
    ),
    EditorView.focusChangeEffect.of((state, focusing) =>
      !focusing && state.field(field) ? setJumpLabels.of(null) : null,
    ),
  ],
});

/**
 * Label the visible words of two or more word characters, nearest to the
 * primary cursor first, alternating forward and backward like Helix.
 */
function gotoWord(view: EditorView): void {
  const { doc, selection } = view.state;
  const cursor = blockCursor(doc, selection.main);
  const forward: Word[] = [];
  const backward: Word[] = [];
  for (const visible of view.visibleRanges) {
    const from = doc.lineAt(visible.from).from;
    const text = doc.sliceString(from, doc.lineAt(visible.to).to);
    for (const match of text.matchAll(/[\p{Alphabetic}\p{N}_]{2,}/gu)) {
      const word = {
        from: from + match.index,
        to: from + match.index + match[0].length,
      };
      if (word.from > cursor) {
        forward.push(word);
      } else if (word.to <= cursor) {
        backward.push(word);
      }
    }
  }
  backward.reverse();
  const words: Word[] = [];
  for (let i = 0; i < Math.max(forward.length, backward.length); i++) {
    words.push(
      ...[forward[i], backward[i]].filter((word) => word !== undefined),
    );
  }
  if (words.length > 0) {
    const labelled = words.slice(0, JUMP_LABEL_ALPHABET.length ** 2);
    view.dispatch({
      effects: setJumpLabels.of({
        words: labelled,
        decorations: jumpLabelDecorations(view.state, labelled),
      }),
    });
  }
}

/**
 * Two keys pick a label and select its word. Any other key cancels; either
 * way the key is consumed, so Escape cancels without leaving the editor.
 */
function handleJumpLabelKey(event: KeyboardEvent, view: EditorView): boolean {
  const labels = view.state.field(jumpLabelsField);
  if (!labels || ["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
  const index = hasModifier ? -1 : JUMP_LABEL_ALPHABET.indexOf(event.key);
  const size = JUMP_LABEL_ALPHABET.length;
  if (index === -1 || event.key.length !== 1) {
    view.dispatch({ effects: setJumpLabels.of(null) });
  } else if (labels.first === undefined) {
    view.dispatch({
      effects: setJumpLabels.of(
        index * size < labels.words.length ? { ...labels, first: index } : null,
      ),
    });
  } else {
    const word = labels.words[labels.first * size + index];
    view.dispatch({
      effects: setJumpLabels.of(null),
      selection: word ? EditorSelection.range(word.from, word.to) : undefined,
    });
  }
  return true;
}

/** Overlay each word's first two characters with its label. */
function jumpLabelDecorations(
  state: EditorState,
  words: readonly Word[],
): DecorationSet {
  const size = JUMP_LABEL_ALPHABET.length;
  return Decoration.set(
    words.flatMap(({ from }, i) => {
      const second = clusterBreak(state.doc, from, true);
      return [
        jumpLabel(JUMP_LABEL_ALPHABET[Math.floor(i / size)]).range(
          from,
          second,
        ),
        jumpLabel(JUMP_LABEL_ALPHABET[i % size]).range(
          second,
          clusterBreak(state.doc, second, true),
        ),
      ];
    }),
    // Labels are in distance order, not document order
    true,
  );
}

function jumpLabel(char: string): Decoration {
  return Decoration.replace({ widget: new JumpLabelWidget(char) });
}

class JumpLabelWidget extends WidgetType {
  private readonly char: string;

  constructor(char: string) {
    super();
    this.char = char;
  }

  override eq(other: JumpLabelWidget): boolean {
    return other.char === this.char;
  }

  override toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-jump-label";
    element.textContent = this.char;
    return element;
  }
}

const jumpLabelTheme = EditorView.baseTheme({
  ".cm-jump-label": {
    color: "var(--red-11)",
    fontWeight: "bold",
  },
});
