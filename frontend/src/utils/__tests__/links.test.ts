/* Copyright 2026 Marimo. All rights reserved. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionId } from "@/core/kernel/session";
import { notebookLinkTarget } from "../links";

function mockDisplayMode(standalone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
    })),
  );
}

describe("notebookLinkTarget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the same notebook in one named tab per session in a browser", () => {
    mockDisplayMode(false);
    const target = notebookLinkTarget("dir/a b.py");
    expect(target).toBe(`${getSessionId()}-dir%2Fa%20b.py`);
    expect(notebookLinkTarget("other.py")).not.toBe(target);
  });

  it("stays in the window when running as an installed or --app app", () => {
    mockDisplayMode(true);
    expect(notebookLinkTarget("a.py")).toBe("_self");
  });
});
