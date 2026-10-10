/* Copyright 2026 Marimo. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  type Hotkey,
  type HotkeyAction,
  HotkeyProvider,
  type ShortcutScope,
} from "@/core/hotkeys/hotkeys";
import {
  findDuplicateShortcuts,
  normalizeShortcutKey,
} from "../useDuplicateShortcuts";

/**
 * Helper to create a minimal hotkey configuration for testing.
 */
function createHotkeys(
  keys: Partial<Record<HotkeyAction, Hotkey>>,
): Record<HotkeyAction, Hotkey> {
  return new Proxy(keys as Record<HotkeyAction, Hotkey>, {
    // oxlint-ignore-next-line -- ok to have three arguments here (It's a web API)
    get(target, p, receiver) {
      const key = Reflect.get(target, p, receiver);
      if (key === "undefined") {
        throw new Error("Missing required hotkey.");
      }
      return key;
    },
  });
}

describe("normalizeShortcutKey", () => {
  it("should convert to lowercase", () => {
    expect(normalizeShortcutKey("Ctrl-Shift-A")).toBe("ctrl-shift-a");
    expect(normalizeShortcutKey("MOD-ENTER")).toBe("mod-enter");
  });

  it("should replace + with -", () => {
    expect(normalizeShortcutKey("Ctrl+Shift+A")).toBe("ctrl-shift-a");
    expect(normalizeShortcutKey("Cmd+Enter")).toBe("cmd-enter");
  });

  it("should trim whitespace", () => {
    expect(normalizeShortcutKey("  Ctrl-A  ")).toBe("ctrl-a");
    expect(normalizeShortcutKey(" Mod-Enter ")).toBe("mod-enter");
  });

  it("should handle mixed separators", () => {
    expect(normalizeShortcutKey("Ctrl+Shift-A")).toBe("ctrl-shift-a");
    expect(normalizeShortcutKey("Mod-Alt+K")).toBe("mod-alt-k");
  });
});

describe("findDuplicateShortcuts", () => {
  it("should detect no duplicates when all shortcuts are unique", () => {
    const hotkeys = createHotkeys({
      "cell.run": {
        name: "Run cell",
        group: "Running Cells",
        scopes: ["notebook"],
        key: "Mod-Enter",
      },
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "cell.delete": {
        name: "Delete cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Shift-Backspace",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    expect(result.duplicates).toHaveLength(0);
    expect(result.hasDuplicate("cell.run")).toBe(false);
    expect(result.hasDuplicate("cell.format")).toBe(false);
    expect(result.hasDuplicate("cell.delete")).toBe(false);
  });

  it("should detect duplicates when two actions share the same key", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "markdown.bold": {
        name: "Bold",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "cell.run": {
        name: "Run cell",
        group: "Running Cells",
        scopes: ["notebook"],
        key: "Mod-Enter",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].key).toBe("cmd-b");
    expect(result.duplicates[0].actions).toHaveLength(2);

    expect(result.hasDuplicate("cell.format")).toBe(true);
    expect(result.hasDuplicate("markdown.bold")).toBe(true);
    expect(result.hasDuplicate("cell.run")).toBe(false);
  });

  it("should detect multiple duplicate groups", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "markdown.bold": {
        name: "Bold",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "cell.run": {
        name: "Run cell",
        group: "Running Cells",
        scopes: ["notebook"],
        key: "Mod-Enter",
      },
      "cell.complete": {
        name: "Code completion",
        group: "Editing",
        scopes: ["notebook"],
        key: "Ctrl-Space",
      },
      "cell.signatureHelp": {
        name: "Signature help",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-Enter",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    expect(result.duplicates).toHaveLength(2);

    // Check that both duplicate groups are detected
    const duplicateKeys = result.duplicates.map((d) => d.key).toSorted();
    expect(duplicateKeys).toEqual(["cmd-b", "cmd-enter"]);

    expect(result.hasDuplicate("cell.format")).toBe(true);
    expect(result.hasDuplicate("markdown.bold")).toBe(true);
    expect(result.hasDuplicate("cell.run")).toBe(true);
    expect(result.hasDuplicate("cell.signatureHelp")).toBe(true);
    expect(result.hasDuplicate("cell.complete")).toBe(false);
  });

  it("should handle three or more actions with the same key", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-k",
      },
      "markdown.link": {
        name: "Convert to Link",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Mod-k",
      },
      "global.commandPalette": {
        name: "Show command palette",
        group: "Other",
        scopes: ["notebook"],
        key: "Mod-k",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].actions).toHaveLength(3);
    expect(result.duplicates[0].key).toBe("cmd-k");
  });

  it("should ignore empty or unset shortcuts", () => {
    const hotkeys = createHotkeys({
      "cell.run": {
        name: "Run cell",
        group: "Running Cells",
        scopes: ["notebook"],
        key: "Mod-Enter",
      },
      "global.runAll": {
        name: "Re-run all cells",
        group: "Running Cells",
        scopes: ["notebook"],
        key: "",
      },
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-b",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    expect(result.duplicates).toHaveLength(0);
    expect(result.hasDuplicate("global.runAll")).toBe(false);
  });

  it("should normalize keys for comparison (case and separator insensitive)", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Cmd-B",
      },
      "markdown.bold": {
        name: "Bold",
        group: "Markdown",
        scopes: ["notebook"],
        key: "cmd+b",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].actions).toHaveLength(2);
  });

  it("getDuplicatesFor should return other actions with the same key", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "markdown.bold": {
        name: "Bold",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Mod-b",
      },
      "markdown.italic": {
        name: "Italic",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Mod-i",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    const duplicatesForFormat = result.getDuplicatesFor("cell.format");
    expect(duplicatesForFormat).toEqual(["markdown.bold"]);

    const duplicatesForBold = result.getDuplicatesFor("markdown.bold");
    expect(duplicatesForBold).toEqual(["cell.format"]);

    const duplicatesForItalic = result.getDuplicatesFor("markdown.italic");
    expect(duplicatesForItalic).toEqual([]);
  });

  it("getDuplicatesFor should return all other actions when three or more share a key", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: "Mod-k",
      },
      "markdown.link": {
        name: "Convert to Link",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Mod-k",
      },
      "global.commandPalette": {
        name: "Show command palette",
        group: "Other",
        scopes: ["notebook"],
        key: "Mod-k",
      },
    });

    const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const result = findDuplicateShortcuts(provider);

    const duplicatesForFormat = result.getDuplicatesFor("cell.format");
    expect(duplicatesForFormat).toHaveLength(2);
    expect(duplicatesForFormat).toContain("markdown.link");
    expect(duplicatesForFormat).toContain("global.commandPalette");
  });

  it("should respect platform-specific key overrides", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: {
          main: "Mod-Shift-F",
          mac: "Cmd-Option-F",
          windows: "Ctrl-Alt-F",
        },
      },
      "markdown.bold": {
        name: "Bold",
        group: "Markdown",
        scopes: ["notebook"],
        key: "Cmd-Option-F", // Duplicate on Mac only
      },
    });

    const macProvider = new HotkeyProvider(hotkeys, { platform: "mac" });
    const macResult = findDuplicateShortcuts(macProvider);
    expect(macResult.duplicates).toHaveLength(1);
    expect(macResult.hasDuplicate("cell.format")).toBe(true);
    expect(macResult.hasDuplicate("markdown.bold")).toBe(true);

    const windowsProvider = new HotkeyProvider(hotkeys, {
      platform: "windows",
    });
    const windowsResult = findDuplicateShortcuts(windowsProvider);
    expect(windowsResult.duplicates).toHaveLength(0);
    expect(windowsResult.hasDuplicate("cell.format")).toBe(false);
    expect(windowsResult.hasDuplicate("markdown.bold")).toBe(false);
  });

  describe("ignoreGroup parameter", () => {
    it("should ignore duplicates from the specified group", () => {
      const hotkeys = createHotkeys({
        "cell.format": {
          name: "Format cell",
          group: "Editing",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "markdown.bold": {
          name: "Bold",
          group: "Markdown",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "cell.run": {
          name: "Run cell",
          group: "Running Cells",
          scopes: ["notebook"],
          key: "Mod-Enter",
        },
      });

      const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
      const result = findDuplicateShortcuts(provider, "Markdown");

      // markdown.bold should be ignored, so no duplicates should be found
      expect(result.duplicates).toHaveLength(0);
      expect(result.hasDuplicate("cell.format")).toBe(false);
      expect(result.hasDuplicate("markdown.bold")).toBe(false);
    });

    it("should still detect duplicates outside the ignored group", () => {
      const hotkeys = createHotkeys({
        "cell.format": {
          name: "Format cell",
          group: "Editing",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "markdown.bold": {
          name: "Bold",
          group: "Markdown",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "cell.run": {
          name: "Run cell",
          group: "Running Cells",
          scopes: ["notebook"],
          key: "Mod-Enter",
        },
        "cell.complete": {
          name: "Code completion",
          group: "Editing",
          scopes: ["notebook"],
          key: "Mod-Enter",
        },
      });

      const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
      const result = findDuplicateShortcuts(provider, "Markdown");

      // markdown.bold is ignored, but cell.run and cell.complete should still be detected
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].key).toBe("cmd-enter");
      expect(result.hasDuplicate("cell.run")).toBe(true);
      expect(result.hasDuplicate("cell.complete")).toBe(true);
      expect(result.hasDuplicate("markdown.bold")).toBe(false);
      expect(result.hasDuplicate("cell.format")).toBe(false);
    });

    it("should handle ignoring a group that doesn't exist", () => {
      const hotkeys = createHotkeys({
        "cell.format": {
          name: "Format cell",
          group: "Editing",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "markdown.bold": {
          name: "Bold",
          group: "Markdown",
          scopes: ["notebook"],
          key: "Mod-b",
        },
      });

      const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
      // oxlint-disable-next-line typescript/no-explicit-any
      const result = findDuplicateShortcuts(provider, "NonExistent" as any);

      // Should still work normally and detect the duplicate
      expect(result.duplicates).toHaveLength(1);
      expect(result.hasDuplicate("cell.format")).toBe(true);
      expect(result.hasDuplicate("markdown.bold")).toBe(true);
    });

    it("should ignore multiple actions from the same group", () => {
      const hotkeys = createHotkeys({
        "cell.format": {
          name: "Format cell",
          group: "Editing",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "markdown.bold": {
          name: "Bold",
          group: "Markdown",
          scopes: ["notebook"],
          key: "Mod-b",
        },
        "markdown.italic": {
          name: "Italic",
          group: "Markdown",
          scopes: ["notebook"],
          key: "Mod-i",
        },
        "cell.hideCode": {
          name: "Hide cell code",
          group: "Editing",
          scopes: ["notebook"],
          key: "Mod-i",
        },
      });

      const provider = new HotkeyProvider(hotkeys, { platform: "mac" });
      const result = findDuplicateShortcuts(provider, "Markdown");

      // Both markdown actions should be ignored
      expect(result.duplicates).toHaveLength(0);
      expect(result.hasDuplicate("cell.format")).toBe(false);
      expect(result.hasDuplicate("cell.hideCode")).toBe(false);
      expect(result.hasDuplicate("markdown.bold")).toBe(false);
      expect(result.hasDuplicate("markdown.italic")).toBe(false);
    });
  });

  describe("shortcut scopes", () => {
    const scoped = (
      first: ShortcutScope,
      second: ShortcutScope,
    ): HotkeyProvider =>
      new HotkeyProvider(
        createHotkeys({
          "cell.createBelow": {
            name: "New cell below",
            group: "Creation and Ordering",
            scopes: [first],
            key: "o",
          },
          "cell.toggleComment": {
            name: "Toggle comment",
            group: "Editing",
            scopes: [second],
            key: "o",
          },
        }),
        { platform: "linux" },
      );

    it("allows the same key in editor and cell command scope", () => {
      const result = findDuplicateShortcuts(scoped("cell-command", "editor"));
      expect(result.duplicates).toEqual([]);
      expect(result.hasDuplicate("cell.createBelow")).toBe(false);
    });

    it.each([
      ["cell-command", "cell-command"],
      ["editor", "editor"],
      ["notebook", "editor"],
      ["cell-command", "notebook"],
    ] as const)("flags the same key in %s and %s scope", (first, second) => {
      const result = findDuplicateShortcuts(scoped(first, second));
      expect(result.hasDuplicate("cell.createBelow")).toBe(true);
      expect(result.getDuplicatesFor("cell.createBelow")).toEqual([
        "cell.toggleComment",
      ]);
    });
  });
});
