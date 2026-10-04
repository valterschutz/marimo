/* Copyright 2026 Marimo. All rights reserved. */

import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockNotebook } from "@/__mocks__/notebook";
import { cellId } from "@/__tests__/branded";
import { notebookAtom } from "@/core/cells/cells";
import { type CellId, HTMLCellId } from "@/core/cells/ids";
import { store } from "@/core/state/jotai";
import {
  useDeleteCellCallback,
  useDeleteManyCellsCallback,
} from "../useDeleteCell";

vi.mock("@/core/network/requests", () => ({
  useRequestClient: () => ({
    sendDeleteCell: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: () => ({ dismiss: vi.fn() }),
}));

const A = cellId("a");
const B = cellId("b");
const C = cellId("c");

/** Mounts a focusable cell container per cell, as the notebook renders them. */
function mountCells(cellIds: CellId[]): Record<CellId, HTMLElement> {
  const elements = {} as Record<CellId, HTMLElement>;
  for (const id of cellIds) {
    const cell = document.createElement("div");
    cell.id = HTMLCellId.create(id);
    cell.className = "marimo-cell";
    cell.tabIndex = -1;
    const editor = document.createElement("textarea");
    cell.append(editor);
    document.body.append(cell);
    elements[id] = cell;
  }
  return elements;
}

function renderDeleteHooks() {
  return renderHook(
    () => ({
      deleteCell: useDeleteCellCallback(),
      deleteCells: useDeleteManyCellsCallback(),
    }),
    {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    },
  ).result;
}

describe("deleting a cell", () => {
  let cells: Record<CellId, HTMLElement>;

  beforeEach(() => {
    store.set(
      notebookAtom,
      MockNotebook.notebookState({
        cellData: {
          [A]: { code: "1" },
          [B]: { code: "2" },
          [C]: { code: "3" },
        },
      }),
    );
    cells = mountCells([A, B, C]);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("gives cell focus to the previous cell when the cell had cell focus", () => {
    const result = renderDeleteHooks();
    cells[B].focus();

    act(() => result.current.deleteCell({ cellId: B }));

    expect(document.activeElement).toBe(cells[A]);
  });

  it("gives cell focus to the next cell when the first cell is deleted", () => {
    const result = renderDeleteHooks();
    cells[A].focus();

    act(() => result.current.deleteCell({ cellId: A }));

    expect(document.activeElement).toBe(cells[B]);
  });

  it("keeps cell focus when deleting a cell selection", async () => {
    const result = renderDeleteHooks();
    cells[C].focus();

    await act(() => result.current.deleteCells({ cellIds: [B, C] }));

    expect(document.activeElement).toBe(cells[A]);
  });

  it("leaves focus alone when the cell's editor had focus", () => {
    const result = renderDeleteHooks();
    const editor = cells[B].querySelector("textarea");
    editor?.focus();

    act(() => result.current.deleteCell({ cellId: B }));

    // The editor is focused later, when the notebook scrolls to the target.
    expect(document.activeElement).toBe(editor);
  });
});
