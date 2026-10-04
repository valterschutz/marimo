/* Copyright 2026 Marimo. All rights reserved. */
// @vitest-environment jsdom

import {
  EditorSelection,
  EditorState,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { formattingChangeEffect } from "../../format";
import { loroSyncAnnotation } from "../../rtc/loro/sync";
import { exportedForTesting, revealHiddenCodeOnSelection } from "../extensions";

const { shouldAutorunMarkdownUpdate } = exportedForTesting;

function createTransaction(spec: TransactionSpec) {
  return EditorState.create({ doc: "" }).update(spec);
}

describe("shouldAutorunMarkdownUpdate", () => {
  it.each(["input.type", "delete.backward", "undo", "redo"])(
    "accepts local %s transactions",
    (userEvent) => {
      const transaction = createTransaction({
        changes: { from: 0, insert: "#" },
        annotations: [Transaction.userEvent.of(userEvent)],
      });

      expect(
        shouldAutorunMarkdownUpdate({
          docChanged: transaction.docChanged,
          transactions: [transaction],
        }),
      ).toBe(true);
    },
  );

  it("ignores formatting changes", () => {
    const transaction = createTransaction({
      changes: { from: 0, insert: "#" },
      annotations: [Transaction.userEvent.of("input.type")],
      effects: [formattingChangeEffect.of(true)],
    });

    expect(
      shouldAutorunMarkdownUpdate({
        docChanged: transaction.docChanged,
        transactions: [transaction],
      }),
    ).toBe(false);
  });

  it("ignores RTC sync transactions", () => {
    const transaction = createTransaction({
      changes: { from: 0, insert: "#" },
      annotations: [
        Transaction.userEvent.of("input.type"),
        loroSyncAnnotation.of(true),
      ],
    });

    expect(
      shouldAutorunMarkdownUpdate({
        docChanged: transaction.docChanged,
        transactions: [transaction],
        hasFocus: true,
      }),
    ).toBe(false);
  });

  it("ignores programmatic doc changes without a user event", () => {
    const transaction = createTransaction({
      changes: { from: 0, insert: "#" },
    });

    expect(
      shouldAutorunMarkdownUpdate({
        docChanged: transaction.docChanged,
        transactions: [transaction],
      }),
    ).toBe(false);
  });

  it("allows focused local doc changes without user event annotations", () => {
    const transaction = createTransaction({
      changes: { from: 0, insert: "#" },
    });

    expect(
      shouldAutorunMarkdownUpdate({
        docChanged: transaction.docChanged,
        transactions: [transaction],
        hasFocus: true,
      }),
    ).toBe(true);
  });

  it("honors the predicate gate", () => {
    const transaction = createTransaction({
      changes: { from: 0, insert: "#" },
      annotations: [Transaction.userEvent.of("input.type")],
    });

    expect(
      shouldAutorunMarkdownUpdate({
        docChanged: transaction.docChanged,
        transactions: [transaction],
        predicate: () => false,
      }),
    ).toBe(false);
  });
});

describe("revealHiddenCodeOnSelection", () => {
  function createView() {
    const onReveal = vi.fn();
    const view = new EditorView({
      state: EditorState.create({
        doc: "hello world",
        extensions: [revealHiddenCodeOnSelection({ onReveal })],
      }),
    });
    return { view, onReveal };
  }

  it.each(["select", "select.pointer", "select.search"])(
    "reveals on a non-empty %s selection",
    (userEvent) => {
      const { view, onReveal } = createView();
      view.dispatch({
        selection: EditorSelection.range(0, 5),
        userEvent,
      });
      expect(onReveal).toHaveBeenCalledOnce();
    },
  );

  it("ignores a collapsed user selection", () => {
    const { view, onReveal } = createView();
    view.dispatch({
      selection: EditorSelection.cursor(3),
      userEvent: "select",
    });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("ignores a selection set without a user event", () => {
    // The helix engine sets a one-character block cursor this way on mount.
    const { view, onReveal } = createView();
    view.dispatch({ selection: EditorSelection.range(1, 0) });
    expect(onReveal).not.toHaveBeenCalled();
  });
});
