/* Copyright 2026 Marimo. All rights reserved. */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as focusUtils from "@/components/editor/navigation/focus-utils";
import * as cellsModule from "@/core/cells/cells";
import { useFocusFirstCell } from "../useFocusFirstCell";

function mockNotebook(cellIds: string[]) {
  const mockEditor = { focus: vi.fn() };
  vi.spyOn(cellsModule, "getNotebook").mockReturnValue({
    cellIds: { iterateTopLevelIds: cellIds },
    cellHandles: Object.fromEntries(
      cellIds.map((id) => [id, { current: { editorView: mockEditor } }]),
    ),
  } as unknown as cellsModule.NotebookState);
  return mockEditor;
}

describe("useFocusFirstCell", () => {
  let focusCellSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    // Mock document.hasFocus() to return true so focus logic runs
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    focusCellSpy = vi.spyOn(focusUtils, "focusCell").mockImplementation(() => {
      // noop
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should give the first cell cell focus, not editor focus, after delay", () => {
    const mockEditor = mockNotebook(["cell-1", "cell-2"]);

    renderHook(() => useFocusFirstCell());

    // Advance timers by the delay (100ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(focusCellSpy).toHaveBeenCalledExactlyOnceWith("cell-1");
    expect(mockEditor.focus).not.toHaveBeenCalled();
  });

  it("should focus the first cell even if its code is hidden", () => {
    vi.spyOn(cellsModule, "getNotebook").mockReturnValue({
      cellIds: { iterateTopLevelIds: ["cell-1", "cell-2"] },
      cellData: {
        "cell-1": { config: { hide_code: true } },
        "cell-2": { config: { hide_code: false } },
      },
      cellHandles: {},
    } as unknown as cellsModule.NotebookState);

    renderHook(() => useFocusFirstCell());

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(focusCellSpy).toHaveBeenCalledExactlyOnceWith("cell-1");
  });

  it("should not focus anything in an empty notebook", () => {
    mockNotebook([]);

    renderHook(() => useFocusFirstCell());

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(focusCellSpy).not.toHaveBeenCalled();
  });

  it("should focus cell from URL if scrollTo parameter exists", () => {
    // Mock location.hash
    const originalHash = window.location.hash;
    Object.defineProperty(window, "location", {
      value: { hash: "#scrollTo=testCell" },
      writable: true,
    });

    // Mock document.querySelector
    const mockElement = document.createElement("div");
    mockElement.scrollIntoView = vi.fn();
    mockElement.dataset.cellId = "cell-123";

    const querySelectorSpy = vi
      .spyOn(document, "querySelector")
      .mockReturnValue(mockElement as unknown as HTMLElement);

    const mockEditor = mockNotebook(["cell-1", "cell-123"]);

    renderHook(() => useFocusFirstCell());

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(querySelectorSpy).toHaveBeenCalledWith(
      '[data-cell-name="testCell"]',
    );
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockElement.scrollIntoView).toHaveBeenCalled();
    expect(focusCellSpy).toHaveBeenCalledExactlyOnceWith("cell-123");
    expect(mockEditor.focus).not.toHaveBeenCalled();

    // Restore original hash
    Object.defineProperty(window, "location", {
      value: { hash: originalHash },
      writable: true,
    });
  });

  it("should not focus when document does not have focus", () => {
    // Mock document.hasFocus() to return false (e.g., when embedded in iframe)
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    mockNotebook(["cell-1"]);

    renderHook(() => useFocusFirstCell());

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Focus should NOT be called when document doesn't have focus
    expect(focusCellSpy).not.toHaveBeenCalled();
  });
});
