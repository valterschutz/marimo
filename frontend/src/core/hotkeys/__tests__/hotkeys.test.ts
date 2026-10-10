/* Copyright 2026 Marimo. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  type Hotkey,
  type HotkeyAction,
  HotkeyProvider,
  normalizeKeyString,
  OverridingHotkeyProvider,
} from "../hotkeys";

/**
 * Just a helper.
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

describe("HotkeyProvider platform separation", () => {
  it("should not apply Windows overrides to Linux platform", () => {
    const hotkeys = createHotkeys({
      "cell.run": {
        name: "Run cell",
        group: "Running Cells",
        scopes: ["notebook"],
        key: {
          main: "Ctrl-Enter",
          windows: "Alt-Enter",
        },
      },
      "cell.runAndNewBelow": {
        name: "Run and new below",
        group: "Running Cells",
        scopes: ["notebook"],
        key: "Shift-Enter",
      },
    });

    // Create providers for each platform
    const windows = new HotkeyProvider(hotkeys, { platform: "windows" });
    const linux = new HotkeyProvider(hotkeys, { platform: "linux" });
    const mac = new HotkeyProvider(hotkeys, { platform: "mac" });

    expect(windows.getHotkey("cell.run").key).toBe("Alt-Enter");
    expect(linux.getHotkey("cell.run").key).toBe("Ctrl-Enter");
    expect(mac.getHotkey("cell.run").key).toBe("Ctrl-Enter");
  });

  it("should allow each platform to have distinct keybindings", () => {
    const hotkeys = createHotkeys({
      "cell.format": {
        name: "Format cell",
        group: "Editing",
        scopes: ["notebook"],
        key: {
          main: "Mod-Shift-F",
          mac: "Cmd-Option-F",
          windows: "Ctrl-Alt-F",
          linux: "Ctrl-Shift-L",
        },
      },
    });

    const windows = new HotkeyProvider(hotkeys, { platform: "windows" });
    const linux = new HotkeyProvider(hotkeys, { platform: "linux" });
    const mac = new HotkeyProvider(hotkeys, { platform: "mac" });

    // Each platform should get its own specific override
    expect(mac.getHotkey("cell.format").key).toBe("Cmd-Option-F");
    expect(windows.getHotkey("cell.format").key).toBe("Ctrl-Alt-F");
    expect(linux.getHotkey("cell.format").key).toBe("Ctrl-Shift-L");
  });
});

describe("normalizeKeyString", () => {
  it("should capitalize multi-character base key names", () => {
    expect(normalizeKeyString("Shift-enter")).toBe("Shift-Enter");
    expect(normalizeKeyString("Cmd-enter")).toBe("Cmd-Enter");
    expect(normalizeKeyString("Ctrl-backspace")).toBe("Ctrl-Backspace");
    expect(normalizeKeyString("Alt-tab")).toBe("Alt-Tab");
    expect(normalizeKeyString("Cmd-Shift-arrowUp")).toBe("Cmd-Shift-ArrowUp");
  });

  it("should leave already-correct key names unchanged", () => {
    expect(normalizeKeyString("Shift-Enter")).toBe("Shift-Enter");
    expect(normalizeKeyString("Cmd-Enter")).toBe("Cmd-Enter");
    expect(normalizeKeyString("Mod-Shift-Enter")).toBe("Mod-Shift-Enter");
  });

  it("should leave single-character keys unchanged", () => {
    expect(normalizeKeyString("Cmd-a")).toBe("Cmd-a");
    expect(normalizeKeyString("Ctrl-Shift-z")).toBe("Ctrl-Shift-z");
    expect(normalizeKeyString("a")).toBe("a");
  });

  it("should handle keys without modifiers", () => {
    expect(normalizeKeyString("enter")).toBe("Enter");
    expect(normalizeKeyString("Escape")).toBe("Escape");
    expect(normalizeKeyString("F12")).toBe("F12");
  });
});

describe("OverridingHotkeyProvider", () => {
  it("should normalize lowercase key overrides", () => {
    const provider = new OverridingHotkeyProvider(
      {
        "cell.run": "Shift-enter",
        "cell.runAndNewBelow": "Cmd-enter",
      },
      { platform: "mac" },
    );

    expect(provider.getHotkey("cell.run").key).toBe("Shift-Enter");
    expect(provider.getHotkey("cell.runAndNewBelow").key).toBe("Cmd-Enter");
  });

  it("should return defaults when no override is set", () => {
    const provider = new OverridingHotkeyProvider({}, { platform: "mac" });
    expect(provider.getHotkey("cell.run").key).toBe("Cmd-Enter");
    expect(provider.getHotkey("cell.runAndNewBelow").key).toBe("Shift-Enter");
  });

  it("should pass through correctly-cased overrides unchanged", () => {
    const provider = new OverridingHotkeyProvider(
      { "cell.run": "Shift-Enter" },
      { platform: "mac" },
    );
    expect(provider.getHotkey("cell.run").key).toBe("Shift-Enter");
  });

  it("should treat an empty-string override as an explicitly disabled shortcut", () => {
    const provider = new OverridingHotkeyProvider(
      { "cell.run": "" },
      { platform: "mac" },
    );
    expect(provider.getHotkey("cell.run").key).toBe("");
  });
});

describe("shortcut scopes", () => {
  it("activates a cell command binding only in cell command scope", () => {
    const provider = new OverridingHotkeyProvider(
      { "cell.createBelow": { key: "o", scope: "cell-command" } },
      { platform: "linux" },
    );
    expect(provider.getKeys("cell.createBelow", "cell-command")).toEqual([
      "o",
    ]);
    expect(provider.getKeys("cell.createBelow", "editor", "notebook")).toEqual(
      [],
    );
  });
});

describe("binding resolution", () => {
  const linux = (
    overrides: ConstructorParameters<typeof OverridingHotkeyProvider>[0],
    preset?: "default" | "vim" | "helix",
  ) => new OverridingHotkeyProvider(overrides, { platform: "linux", preset });

  it("keeps cell-level actions out of the editor by default", () => {
    const provider = linux({});
    expect(provider.getKeys("cell.createBelow", "editor", "notebook")).toEqual(
      [],
    );
    expect(provider.getKeys("cell.createBelow", "cell-command")).toEqual([
      "Ctrl-Shift-p",
    ]);
    expect(provider.getKeys("cell.run", "notebook")).toEqual(["Ctrl-Enter"]);
    expect(provider.getKeys("cell.format", "editor")).toEqual(["Ctrl-b"]);
  });

  it("puts a plain key override in the action's default scope", () => {
    const provider = linux({ "cell.complete": "Ctrl-x" });
    expect(provider.getBindings("cell.complete")).toEqual([
      { key: "Ctrl-x", scope: "editor" },
    ]);
  });

  it("accepts several bindings in different scopes", () => {
    const provider = linux({
      "cell.createBelow": [
        { key: "o", scope: "cell-command" },
        { key: "Ctrl-Shift-o", scope: "notebook" },
      ],
    });
    expect(provider.getKeys("cell.createBelow", "cell-command")).toEqual([
      "o",
    ]);
    expect(provider.getKeys("cell.createBelow", "notebook")).toEqual([
      "Ctrl-Shift-o",
    ]);
  });

  it("disables every default binding with an empty override", () => {
    const provider = linux({ "cell.focusDown": "" }, "helix");
    expect(provider.getBindings("cell.focusDown")).toEqual([]);
  });

  it.each([
    ["notebook", "o"],
    ["notebook", "Shift-o"],
    ["editor", "Space"],
  ] as const)("rejects the typing key %s scope %s", (scope, key) => {
    const provider = linux({ "cell.run": { key, scope } });
    expect(provider.getBindings("cell.run")).toEqual([]);
    expect(provider.getRejectedBindings("cell.run")).toEqual([
      {
        binding: { key, scope },
        reason:
          "A key without Ctrl, Alt or Cmd would block typing in the editor",
      },
    ]);
  });

  it("accepts named keys and modified keys outside cell command scope", () => {
    const provider = linux({
      "cell.run": [
        { key: "Shift-Enter", scope: "notebook" },
        { key: "Alt-r", scope: "editor" },
      ],
    });
    expect(provider.getRejectedBindings("cell.run")).toEqual([]);
  });

  it("only accepts key sequences in cell command scope", () => {
    const provider = linux({
      "cell.run": [
        { key: "r r", scope: "cell-command" },
        { key: "Ctrl-r Ctrl-r", scope: "notebook" },
      ],
    });
    expect(provider.getBindings("cell.run")).toEqual([
      { key: "r r", scope: "cell-command" },
    ]);
    expect(provider.getRejectedBindings("cell.run")[0].reason).toBe(
      "Key sequences only work in cell-command scope",
    );
  });

  it("rejects a scope the action can't run in", () => {
    const provider = linux({
      "cell.toggleComment": { key: "c", scope: "cell-command" },
    });
    expect(provider.getBindings("cell.toggleComment")).toEqual([]);
    expect(provider.getRejectedBindings("cell.toggleComment")[0].reason).toBe(
      "This action can't run in cell-command scope",
    );
  });

  it("takes the default cell command keys from the preset", () => {
    expect(linux({}, "helix").getKeys("command.openCellBelow", "cell-command"))
      .toEqual(["o"]);
    expect(linux({}, "vim").getKeys("command.createCellAfter", "cell-command"))
      .toEqual(["b", "o"]);
    expect(linux({}, "vim").getKeys("global.focusTop", "cell-command")).toEqual(
      ["Ctrl-ArrowUp", "g g"],
    );
    expect(linux({}, "helix").getBindings("command.cutCell")).toEqual([]);
  });

  it("keeps an action's notebook binding when the preset adds cell command keys", () => {
    expect(linux({}, "helix").getBindings("global.focusTop")).toEqual([
      { key: "Ctrl-Shift-f", scope: "notebook" },
      { key: "Ctrl-ArrowUp", scope: "cell-command" },
      { key: "g g", scope: "cell-command" },
    ]);
  });

  it("overrides the preset's keys for an action", () => {
    const provider = linux(
      { "command.openCellBelow": { key: "Shift-n", scope: "cell-command" } },
      "helix",
    );
    expect(provider.getKeys("command.openCellBelow", "cell-command")).toEqual([
      "Shift-n",
    ]);
  });
});
