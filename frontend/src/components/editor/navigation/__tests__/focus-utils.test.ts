/* Copyright 2026 Marimo. All rights reserved. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type CellId, HTMLCellId } from "@/core/cells/ids";
import { alignCellInView, raf2 } from "../focus-utils";

describe("raf2", () => {
  it("should call callback after two animation frames", async () => {
    const callback = vi.fn();

    raf2(callback);

    expect(callback).not.toHaveBeenCalled();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(callback).not.toHaveBeenCalled();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("alignCellInView", () => {
  const cellId = "a" as CellId;

  /** Mounts the cell inside a scroller of the given height. */
  function mountCell({
    cellHeight,
    windowHeight,
  }: {
    cellHeight: number;
    windowHeight: number;
  }) {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "clientHeight", { value: windowHeight });
    const cell = document.createElement("div");
    cell.id = HTMLCellId.create(cellId);
    Object.defineProperty(cell, "offsetHeight", { value: cellHeight });
    // jsdom doesn't scroll; record the call and the margin it scrolls with.
    const scrolls: Array<{ block: unknown; margin: string }> = [];
    cell.scrollIntoView = (options) => {
      scrolls.push({
        block: (options as ScrollIntoViewOptions).block,
        margin: cell.style.scrollMarginBlock,
      });
    };
    scroller.append(cell);
    document.body.append(scroller);
    return { cell, scrolls };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(["start", "center", "end"] as const)(
    "scrolls the cell to the %s with a scrolloff margin",
    (alignment) => {
      const { cell, scrolls } = mountCell({
        cellHeight: 100,
        windowHeight: 500,
      });

      alignCellInView(cellId, alignment);

      expect(scrolls).toEqual([{ block: alignment, margin: "5lh" }]);
      expect(cell.style.scrollMarginBlock).toBe("");
    },
  );

  it("puts a cell taller than the window at the top instead of centring it", () => {
    const { scrolls } = mountCell({ cellHeight: 800, windowHeight: 500 });

    alignCellInView(cellId, "center");

    expect(scrolls.map(({ block }) => block)).toEqual(["start"]);
  });
});
