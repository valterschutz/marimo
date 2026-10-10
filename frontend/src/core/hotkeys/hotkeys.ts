/* Copyright 2026 Marimo. All rights reserved. */
import { type Platform, resolvePlatform } from "@/core/hotkeys/shortcuts";
import { Objects } from "@/utils/objects";

export const NOT_SET: unique symbol = Symbol("NOT_SET");

/**
 * Where a binding is active: `editor` with editor focus only,
 * `cell-command` in cell command mode only, and `notebook` in both.
 */
export type ShortcutScope = "editor" | "cell-command" | "notebook";

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = [
  "editor",
  "cell-command",
  "notebook",
];

/** A key assigned to an action, together with the scope it is active in. */
export interface Binding {
  /** A chord such as `Mod-Shift-k`, or space-separated chords such as `g g`. */
  key: string;
  scope: ShortcutScope;
}

/**
 * A user's override for an action: a key in the action's default scope
 * (`""` disables the action), a binding, or a list of bindings. An override
 * replaces all of the action's default bindings.
 */
export type BindingOverride = string | Binding | Binding[];

export type KeymapPreset = "default" | "vim" | "helix";

// Scopes an action can run in; the first is its default scope.
const EDITOR: readonly ShortcutScope[] = ["editor"];
const CELL: readonly ShortcutScope[] = ["cell-command", "notebook"];
const CELL_COMMAND: readonly ShortcutScope[] = ["cell-command"];
const NOTEBOOK: readonly ShortcutScope[] = ["notebook", "cell-command"];

export interface Hotkey {
  name: string;
  /**
   * Grouping for the command palette and keyboard shortcuts page.
   * If not specified, the command will not be shown in the command palette.
   */
  group: HotkeyGroup | undefined;
  key:
    | string
    | typeof NOT_SET
    | {
        main: string;
        /** macOS specific override */
        mac?: string;
        /** Windows specific override */
        windows?: string;
        /** Linux specific override */
        linux?: string;
      };
  /**
   * The scopes the action can run in. The first is the scope of its
   * default key and of overrides given as a plain key.
   */
  scopes: readonly ShortcutScope[];
  /**
   * @default true
   */
  editable?: boolean;
  additionalKeywords?: string[];
}

interface ResolvedHotkey {
  name: string;
  key: string;
  additionalKeywords?: string[];
}

type ModKey = "Cmd" | "Ctrl";

export type HotkeyGroup =
  | "Running Cells"
  | "Creation and Ordering"
  | "Navigation"
  | "Editing"
  | "Markdown"
  | "Command"
  | "Other";

const DEFAULT_HOT_KEY = {
  // Cell Navigation
  "cell.focusUp": {
    name: "Go to previous cell",
    group: "Navigation",
    scopes: CELL,
    key: "Mod-Shift-k",
  },
  "cell.focusDown": {
    name: "Go to next cell",
    group: "Navigation",
    scopes: CELL,
    key: "Mod-Shift-j",
  },

  // Creation and Ordering
  "cell.moveUp": {
    name: "Move cell up",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-9",
  },
  "cell.moveDown": {
    name: "Move cell down",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-0",
  },
  "cell.moveLeft": {
    name: "Move left",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-7",
  },
  "cell.moveRight": {
    name: "Move right",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-8",
  },
  "cell.createAbove": {
    name: "New cell above",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-o",
  },
  "cell.createBelow": {
    name: "New cell below",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-p",
  },
  "cell.sendToTop": {
    name: "Send to top",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-1",
  },
  "cell.sendToBottom": {
    name: "Send to bottom",
    group: "Creation and Ordering",
    scopes: CELL,
    key: "Mod-Shift-2",
  },
  "cell.addColumnBreakpoint": {
    name: "Add column breakpoint",
    group: "Creation and Ordering",
    scopes: CELL_COMMAND,
    key: "Mod-Shift-3",
  },

  // Running Cells
  "cell.run": {
    name: "Run",
    group: "Running Cells",
    scopes: ["notebook", "editor", "cell-command"],
    key: "Mod-Enter",
    additionalKeywords: ["execute", "submit"],
  },
  "cell.runAndNewBelow": {
    name: "Run and new below",
    group: "Running Cells",
    scopes: ["notebook", "editor", "cell-command"],
    key: "Shift-Enter",
  },
  "cell.runAndNewAbove": {
    name: "Run and new above",
    group: "Running Cells",
    scopes: ["notebook", "editor", "cell-command"],
    key: "Mod-Shift-Enter",
  },
  "global.runAll": {
    name: "Re-run all cells",
    group: "Running Cells",
    scopes: NOTEBOOK,
    key: NOT_SET,
  },

  // Editing Cells
  "cell.format": {
    name: "Format cell",
    group: "Editing",
    scopes: EDITOR,
    key: "Mod-b",
    additionalKeywords: ["lint"],
  },
  "cell.viewAsMarkdown": {
    name: "View as Markdown",
    group: "Editing",
    scopes: CELL,
    key: "Mod-Shift-m",
  },
  "cell.viewAsSQL": {
    name: "Toggle SQL",
    group: "Editing",
    scopes: CELL,
    key: {
      windows: "Alt-Shift-l",
      main: "Mod-Shift-l",
    },
  },
  "cell.complete": {
    name: "Code completion",
    group: "Editing",
    scopes: EDITOR,
    key: "Ctrl-Space",
  },
  "cell.signatureHelp": {
    name: "Signature help",
    group: "Editing",
    scopes: EDITOR,
    key: "Mod-Shift-Space",
  },
  "cell.undo": {
    name: "Undo",
    group: "Editing",
    scopes: EDITOR,
    key: "Mod-z",
  },
  "cell.redo": {
    name: "Redo",
    group: "Editing",
    scopes: EDITOR,
    key: {
      main: "Mod-Shift-z",
      windows: "Mod-y",
    },
  },
  "cell.findAndReplace": {
    name: "Find and Replace",
    group: "Editing",
    scopes: ["editor", "notebook", "cell-command"],
    key: "Mod-f",
  },
  "cell.selectNextOccurrence": {
    name: "Add selection to next Find match",
    group: "Editing",
    scopes: EDITOR,
    key: "Mod-d",
  },
  "cell.fold": {
    name: "Fold region",
    group: "Editing",
    scopes: EDITOR,
    key: {
      main: "Mod-Alt-[",
      windows: "Mod-Shift-[",
    },
  },
  "cell.unfold": {
    name: "Unfold region",
    group: "Editing",
    scopes: EDITOR,
    key: {
      main: "Mod-Alt-]",
      windows: "Mod-Shift-]",
    },
  },
  "cell.foldAll": {
    name: "Fold all regions",
    group: "Editing",
    scopes: EDITOR,
    key: "Ctrl-Alt-[",
  },
  "cell.unfoldAll": {
    name: "Unfold all regions",
    group: "Editing",
    scopes: EDITOR,
    key: "Ctrl-Alt-]",
  },
  "cell.delete": {
    name: "Delete cell",
    group: "Editing",
    scopes: CELL,
    key: "Shift-Backspace",
    additionalKeywords: ["remove"],
  },
  "cell.hideCode": {
    name: "Hide cell code",
    group: "Editing",
    scopes: CELL,
    key: "Mod-h",
  },
  "cell.aiCompletion": {
    name: "AI completion",
    group: "Editing",
    scopes: ["editor", "cell-command", "notebook"],
    key: "Mod-Shift-e",
  },
  "cell.cellActions": {
    name: "Open cell actions",
    group: "Editing",
    scopes: CELL_COMMAND,
    key: "Mod-p",
  },
  "cell.splitCell": {
    name: "Split cell",
    group: "Editing",
    scopes: EDITOR,
    key: "Mod-Shift-'",
  },
  "cell.toggleComment": {
    name: "Toggle comment",
    group: "Editing",
    scopes: EDITOR,
    // https://github.com/codemirror/commands/blob/6.8.1/src/commands.ts#L1067
    key: "Mod-/",
  },
  "cell.toggleBlockComment": {
    name: "Toggle block comment",
    group: "Editing",
    scopes: EDITOR,
    // https://github.com/codemirror/commands/blob/6.8.1/src/commands.ts#L1068
    key: "Alt-A",
  },
  "cell.renameSymbol": {
    name: "Rename symbol",
    group: "Editing",
    scopes: EDITOR,
    key: "F2",
  },
  "cell.copyLineUp": {
    name: "Copy line(s) up",
    group: "Editing",
    scopes: EDITOR,
    key: "Alt-Shift-ArrowUp",
  },
  "cell.copyLineDown": {
    name: "Copy line(s) down",
    group: "Editing",
    scopes: EDITOR,
    key: "Alt-Shift-ArrowDown",
  },

  // Markdown
  "markdown.bold": {
    name: "Bold",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-b",
  },
  "markdown.italic": {
    name: "Italic",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-i",
  },
  "markdown.link": {
    name: "Convert to Link",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-k",
  },
  "markdown.orderedList": {
    name: "Convert to Ordered list",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-Shift-7",
  },
  "markdown.unorderedList": {
    name: "Convert to Unordered list",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-Shift-8",
  },
  "markdown.blockquote": {
    name: "Convert to Blockquote",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-Shift-9",
  },
  "markdown.code": {
    name: "Convert to Code",
    group: "Markdown",
    scopes: EDITOR,
    key: "Mod-Shift-0",
  },

  // Global Actions
  "global.hideCode": {
    name: "Toggle app view",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Mod-.",
  },
  "global.foldCode": {
    name: "Fold all cells",
    group: "Editing",
    scopes: NOTEBOOK,
    key: {
      main: "Ctrl-Cmd-l",
      windows: "Mod-Shift-l",
    },
  },
  "global.unfoldCode": {
    name: "Unfold all cells",
    group: "Editing",
    scopes: NOTEBOOK,
    key: {
      main: "Ctrl-Cmd-;",
      windows: "Mod-Shift-:",
    },
  },
  "global.showHelp": {
    name: "Show keyboard shortcuts",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Mod-Shift-h",
  },
  "global.save": {
    name: "Save file",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Mod-s",
    additionalKeywords: ["write", "persist"],
  },
  "global.commandPalette": {
    name: "Show command palette",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Mod-k",
  },
  "global.runStale": {
    name: "Run all stale cells",
    group: "Running Cells",
    scopes: NOTEBOOK,
    key: "Mod-Shift-r",
  },
  "global.interrupt": {
    name: "Stop (interrupt) execution",
    group: "Running Cells",
    scopes: NOTEBOOK,
    key: "Mod-i",
  },
  "global.formatAll": {
    name: "Format all",
    group: "Editing",
    scopes: NOTEBOOK,
    key: "Mod-Shift-b",
  },
  "global.toggleLanguage": {
    name: "Toggle language to markdown (if supported)",
    group: "Editing",
    scopes: NOTEBOOK,
    key: "F4",
  },
  "global.toggleTerminal": {
    name: "Show integrated terminal",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Ctrl-`",
  },
  "global.togglePanel": {
    name: "Toggle developer panel",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Mod-j",
  },
  "global.showAllCode": {
    name: "Show all code",
    group: "Editing",
    scopes: NOTEBOOK,
    key: NOT_SET,
    additionalKeywords: ["unhide", "hide", "reveal", "show source"],
  },
  "global.hideAllCode": {
    name: "Hide all code",
    group: "Editing",
    scopes: NOTEBOOK,
    key: NOT_SET,
  },
  "global.showAllMarkdownCode": {
    name: "Show all markdown code",
    group: "Editing",
    scopes: NOTEBOOK,
    key: NOT_SET,
  },
  "global.hideAllMarkdownCode": {
    name: "Hide all markdown code",
    group: "Editing",
    scopes: NOTEBOOK,
    key: NOT_SET,
  },
  "global.collapseAllSections": {
    name: "Collapse all sections",
    group: "Editing",
    scopes: NOTEBOOK,
    key: "Mod-Shift-\\",
    additionalKeywords: ["fold", "headers"],
  },
  "global.expandAllSections": {
    name: "Expand all sections",
    group: "Editing",
    scopes: NOTEBOOK,
    key: "Mod-Shift-/",
    additionalKeywords: ["unfold", "headers"],
  },
  "global.toggleMinimap": {
    name: "Toggle Minimap",
    group: "Other",
    scopes: NOTEBOOK,
    key: "Mod-Shift-i",
  },

  // Global Navigation
  "global.focusTop": {
    name: "Focus top",
    group: "Navigation",
    scopes: NOTEBOOK,
    key: "Mod-Shift-f",
  },
  "global.focusBottom": {
    name: "Focus bottom",
    group: "Navigation",
    scopes: NOTEBOOK,
    key: "Mod-Shift-g",
  },
  "global.toggleSidebar": {
    name: "Toggle helper panel",
    group: "Navigation",
    scopes: NOTEBOOK,
    key: "Mod-Shift-s",
  },
  "cell.goToDefinition": {
    name: "Go to Definition",
    group: "Navigation",
    scopes: EDITOR,
    key: "F12",
  },
  "completion.moveDown": {
    name: "Move completion selection down",
    group: "Editing",
    scopes: EDITOR,
    key: "Ctrl-j",
  },
  "completion.moveUp": {
    name: "Move completion selection up",
    group: "Editing",
    scopes: EDITOR,
    key: "Ctrl-k",
  },

  // Command mode (edit a cell, not the editor)
  "command.vimEnterCommandMode": {
    name: "Enter command mode (vim)",
    group: "Command",
    scopes: EDITOR,
    key: {
      main: "Mod-Escape",
      windows: "Shift-Escape",
    },
  },
  "command.createCellBefore": {
    name: "Create a cell before current cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "a",
  },
  "command.createCellAfter": {
    name: "Create a cell after current cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "b",
  },
  "command.createSqlCellAfter": {
    name: "Create a SQL cell after current cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "q",
  },
  "command.cellToMarkdown": {
    name: "Convert cell to Markdown",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "m",
  },
  "command.cellToCode": {
    name: "Convert cell to Code",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "c",
  },
  "command.hideCode": {
    name: "Toggle hide code for a Markdown cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "Shift-h",
  },
  "command.copyCell": {
    name: "Copy cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "y",
  },
  "command.cutCell": {
    name: "Cut cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "x",
  },
  "command.pasteCell": {
    name: "Paste cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "v",
  },
  "command.pasteCellAbove": {
    name: "Paste cell above",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.deleteCellToClipboard": {
    name: "Delete cell, copying it to the clipboard",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.undoDelete": {
    name: "Undo cell deletion",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.openCellAbove": {
    name: "Create a cell above and edit it",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.openCellBelow": {
    name: "Create a cell below and edit it",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.focusEditor": {
    name: "Edit cell",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "Enter",
  },
  "command.focusEditorInsertMode": {
    name: "Edit cell in insert mode",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.focusLeft": {
    name: "Go to cell in the column to the left",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "ArrowLeft",
  },
  "command.focusRight": {
    name: "Go to cell in the column to the right",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "ArrowRight",
  },
  "command.extendSelectionUp": {
    name: "Extend cell selection up",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "Shift-ArrowUp",
  },
  "command.extendSelectionDown": {
    name: "Extend cell selection down",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "Shift-ArrowDown",
  },
  "command.clearSelection": {
    name: "Clear cell selection",
    group: "Command",
    scopes: CELL_COMMAND,
    key: "Escape",
  },
  "command.toggleSelectMode": {
    name: "Toggle cell select mode",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.alignCenter": {
    name: "Scroll cell to the center",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.alignTop": {
    name: "Scroll cell to the top",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
  "command.alignBottom": {
    name: "Scroll cell to the bottom",
    group: "Command",
    scopes: CELL_COMMAND,
    key: NOT_SET,
  },
} satisfies Record<string, Hotkey>;

export type HotkeyAction = keyof typeof DEFAULT_HOT_KEY;

type PresetCommandKeys = Partial<Record<HotkeyAction, string[]>>;

const SHARED_COMMAND_KEYS: PresetCommandKeys = {
  "cell.focusUp": ["Mod-Shift-k", "ArrowUp"],
  "cell.focusDown": ["Mod-Shift-j", "ArrowDown"],
  "global.focusTop": ["Mod-ArrowUp"],
  "global.focusBottom": ["Mod-ArrowDown"],
};

/**
 * Each preset's cell command scope keys. An entry replaces the action's
 * default cell command binding, so it lists every key the action keeps.
 */
const PRESET_COMMAND_KEYS: Record<KeymapPreset, PresetCommandKeys> = {
  default: {
    ...SHARED_COMMAND_KEYS,
    "global.save": ["s"],
  },
  vim: {
    ...SHARED_COMMAND_KEYS,
    "global.save": ["s"],
    "cell.focusUp": ["Mod-Shift-k", "ArrowUp", "k"],
    "cell.focusDown": ["Mod-Shift-j", "ArrowDown", "j"],
    "command.focusLeft": ["ArrowLeft", "h"],
    "command.focusRight": ["ArrowRight", "l"],
    "command.focusEditor": ["Enter", "i"],
    "command.extendSelectionUp": ["Shift-ArrowUp", "Shift-k"],
    "command.extendSelectionDown": ["Shift-ArrowDown", "Shift-j"],
    "global.focusTop": ["Mod-ArrowUp", "g g"],
    "global.focusBottom": ["Mod-ArrowDown", "Shift-g"],
    "cell.delete": ["Shift-Backspace", "d d"],
    "command.copyCell": ["y y"],
    "command.pasteCell": ["v", "p"],
    "command.pasteCellAbove": ["Shift-p"],
    "command.createCellBefore": ["a", "Shift-o"],
    "command.createCellAfter": ["b", "o"],
    "command.undoDelete": ["u"],
  },
  helix: {
    ...SHARED_COMMAND_KEYS,
    "cell.focusUp": ["Mod-Shift-k", "ArrowUp", "k"],
    "cell.focusDown": ["Mod-Shift-j", "ArrowDown", "j"],
    "command.focusLeft": ["ArrowLeft", "h"],
    "command.focusRight": ["ArrowRight", "l"],
    "global.focusTop": ["Mod-ArrowUp", "g g"],
    "global.focusBottom": ["Mod-ArrowDown", "Shift-g"],
    "command.alignCenter": ["z z", "z c"],
    "command.alignTop": ["z t"],
    "command.alignBottom": ["z b"],
    "command.extendSelectionUp": ["Shift-ArrowUp", "Shift-x"],
    "command.extendSelectionDown": ["Shift-ArrowDown", "x"],
    "command.toggleSelectMode": ["v"],
    "cell.moveUp": ["Mod-Shift-9", "Shift-k"],
    "cell.moveDown": ["Mod-Shift-0", "Shift-j"],
    "command.deleteCellToClipboard": ["d"],
    "command.copyCell": ["y"],
    "command.cutCell": [],
    "command.pasteCell": ["p"],
    "command.pasteCellAbove": ["Shift-p"],
    "command.undoDelete": ["u"],
    "command.focusEditorInsertMode": ["i"],
    "command.openCellAbove": ["Shift-o"],
    "command.openCellBelow": ["o"],
  },
};

export function isHotkeyAction(x: string): x is HotkeyAction {
  return x in DEFAULT_HOT_KEY;
}

export function getDefaultHotkey(action: HotkeyAction): ResolvedHotkey {
  return new HotkeyProvider(DEFAULT_HOT_KEY).getHotkey(action);
}
export interface IHotkeyProvider {
  getHotkey(action: HotkeyAction): ResolvedHotkey;
}

interface HotkeyProviderOptions {
  /**
   * The target platform for the key provider.
   *
   * If `undefined`, the platform is detected at runtime.
   * An explicit value is generally only provided in tests.
   */
  platform?: Platform;
  /**
   * The keymap preset, which supplies the default cell command scope keys.
   *
   * @default "default"
   */
  preset?: KeymapPreset;
}

export class HotkeyProvider implements IHotkeyProvider {
  private mod: ModKey;
  private platform: Platform;
  private preset: KeymapPreset;

  /**
   * @param platform - See {@link HotkeyProviderOptions.platform}.
   */
  static create(platform?: Platform): HotkeyProvider {
    return new HotkeyProvider(DEFAULT_HOT_KEY, { platform });
  }

  private hotkeys: Record<HotkeyAction, Hotkey>;

  constructor(
    hotkeys: Record<HotkeyAction, Hotkey>,
    options: HotkeyProviderOptions = {},
  ) {
    this.hotkeys = hotkeys;
    this.platform = options.platform ?? resolvePlatform();
    this.mod = this.platform === "mac" ? "Cmd" : "Ctrl";
    this.preset = options.preset ?? "default";
  }

  iterate(): HotkeyAction[] {
    return Objects.keys(this.hotkeys);
  }

  /** The scopes the action can run in; the first is its default scope. */
  getScopes(action: HotkeyAction): readonly ShortcutScope[] {
    return this.hotkeys[action].scopes;
  }

  /** The action's bindings from its definition and the preset. */
  getDefaultBindings(action: HotkeyAction): Binding[] {
    const { key, scopes } = this.hotkeys[action];
    const [defaultScope] = scopes;
    const commandKeys = PRESET_COMMAND_KEYS[this.preset][action];
    const bindings: Binding[] = [];
    const defaultKey = this.resolveDefaultKey(key);
    if (defaultKey && !(defaultScope === "cell-command" && commandKeys)) {
      bindings.push({ key: defaultKey, scope: defaultScope });
    }
    for (const commandKey of commandKeys ?? []) {
      bindings.push({ key: this.resolveMod(commandKey), scope: "cell-command" });
    }
    return bindings;
  }

  /** The action's bindings in effect. */
  getBindings(action: HotkeyAction): Binding[] {
    return this.getDefaultBindings(action);
  }

  /** The keys of the action's bindings in any of the given scopes. */
  getKeys(action: HotkeyAction, ...scopes: ShortcutScope[]): string[] {
    return this.getBindings(action)
      .filter((binding) => scopes.includes(binding.scope))
      .map((binding) => binding.key);
  }

  /** The action with the key of its first binding, for display. */
  getHotkey(action: HotkeyAction): ResolvedHotkey {
    const { name, additionalKeywords } = this.hotkeys[action];
    return {
      name,
      key: this.getBindings(action)[0]?.key ?? "",
      additionalKeywords,
    };
  }

  getHotkeyDisplay(action: HotkeyAction): string {
    return this.hotkeys[action].name;
  }

  isEditable(action: HotkeyAction): boolean {
    return this.hotkeys[action].editable !== false;
  }

  getHotkeyGroups(): Record<HotkeyGroup, HotkeyAction[]> {
    return Objects.groupBy(
      Objects.entries(this.hotkeys),
      ([, hotkey]) => hotkey.group,
      ([action]) => action,
    );
  }

  protected resolveMod(key: string): string {
    return key.replace("Mod", this.mod);
  }

  private resolveDefaultKey(key: Hotkey["key"]): string {
    if (key === NOT_SET) {
      return "";
    }
    if (typeof key === "string") {
      return this.resolveMod(key);
    }
    return this.resolveMod(key[this.platform] || key.main);
  }
}

/** A binding from the user's overrides that was rejected, and why. */
export interface RejectedBinding {
  binding: Binding;
  reason: string;
}

export class OverridingHotkeyProvider extends HotkeyProvider {
  private readonly overrides: Partial<
    Record<HotkeyAction, BindingOverride | undefined>
  >;

  constructor(
    overrides: Partial<Record<HotkeyAction, BindingOverride | undefined>>,
    options: HotkeyProviderOptions = {},
  ) {
    super(DEFAULT_HOT_KEY, options);
    this.overrides = overrides;
  }

  override getBindings(action: HotkeyAction): Binding[] {
    const overridden = this.getOverriddenBindings(action);
    if (!overridden) {
      return super.getBindings(action);
    }
    const scopes = this.getScopes(action);
    return overridden.filter(
      (binding) => validateBinding(binding, scopes) === undefined,
    );
  }

  /** The user's bindings for the action that are not in effect, and why. */
  getRejectedBindings(action: HotkeyAction): RejectedBinding[] {
    const scopes = this.getScopes(action);
    return (this.getOverriddenBindings(action) ?? []).flatMap((binding) => {
      const reason = validateBinding(binding, scopes);
      return reason === undefined ? [] : [{ binding, reason }];
    });
  }

  private getOverriddenBindings(action: HotkeyAction): Binding[] | undefined {
    const override = this.overrides[action];
    if (override === undefined) {
      return undefined;
    }
    return toBindings(override, this.getScopes(action)[0]).map((binding) => ({
      key: this.resolveMod(normalizeKeySequence(binding.key)),
      scope: binding.scope,
    }));
  }
}

/**
 * Converts an override to bindings. A plain key is in the default scope, and
 * an empty one (or an empty list) disables the action.
 */
export function toBindings(
  override: BindingOverride,
  defaultScope: ShortcutScope,
): Binding[] {
  if (typeof override === "string") {
    return override.trim() === "" ? [] : [{ key: override, scope: defaultScope }];
  }
  return Array.isArray(override) ? override : [override];
}

/** The chords of a key, e.g. `["g", "g"]` for the sequence `g g`. */
export function getChords(key: string): string[] {
  return key.trim().split(/\s+/);
}

/**
 * Whether a chord types a character: a single character or Space, with no
 * modifier other than Shift.
 */
function isTypingChord(chord: string): boolean {
  const separator = chord.length > 1 && chord.includes("+") ? "+" : "-";
  const parts = chord.split(separator);
  const base = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const typesCharacter = base.length === 1 || base.toLowerCase() === "space";
  return (
    typesCharacter &&
    modifiers.every((modifier) => modifier.toLowerCase() === "shift")
  );
}

/**
 * Returns why a binding can't be used for an action that runs in `scopes`,
 * or `undefined` if it can.
 */
export function validateBinding(
  binding: Binding,
  scopes: readonly ShortcutScope[],
): string | undefined {
  if (!SHORTCUT_SCOPES.includes(binding.scope)) {
    return `Unknown scope "${binding.scope}"`;
  }
  if (!scopes.includes(binding.scope)) {
    return `This action can't run in ${binding.scope} scope`;
  }
  if (binding.scope === "cell-command") {
    return undefined;
  }
  const chords = getChords(binding.key);
  if (chords.length > 1) {
    return "Key sequences only work in cell-command scope";
  }
  if (isTypingChord(chords[0])) {
    return "A key without Ctrl, Alt or Cmd would block typing in the editor";
  }
  return undefined;
}

const MODIFIER_RE = /^(cmd|ctrl|alt|shift|meta|mod)$/i;

/**
 * Capitalize multi-character base key names so they match the
 * casing that KeyboardEvent.key (and therefore CodeMirror) uses.
 * e.g. "Shift-enter" → "Shift-Enter", "Cmd-backspace" → "Cmd-Backspace"
 */
export function normalizeKeySequence(key: string): string {
  return getChords(key).map(normalizeKeyString).join(" ");
}

export function normalizeKeyString(key: string): string {
  const parts = key.split("-");
  const last = parts[parts.length - 1];
  if (last.length > 1 && !MODIFIER_RE.test(last)) {
    parts[parts.length - 1] = last.charAt(0).toUpperCase() + last.slice(1);
  }
  return parts.join("-");
}
