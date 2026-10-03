# codemirror-helix 0.6.0: facts gathered from the published package

Source: npm tarball `codemirror-helix@0.6.0` (`dist/lib.d.ts`, `dist/lib.development.js`).
Repository: https://gitlab.com/_rvidal/codemirror-helix (MPL-2.0).
Peer deps: `@codemirror/view ^6.22`, `@codemirror/state ^6.6`, `@codemirror/search ^6.2`, `@codemirror/commands ^6`, `@codemirror/language ^6`.

## Public API (`lib.d.ts`)

```ts
export declare function helix(options?: Options): Extension;
export interface Options {
  config?: { "editor.cursor-shape.insert"?: "block" | "bar"; "editor.default-yank-register"?: string; theme?: string };
  themes?: ...;
  drawSelection?: boolean;   // default true; the library adds its own drawSelection({cursorBlinkRate: 0, drawRangeCursor: cursorShape === "bar"})
  init?: EditorState | Snapshot;
  globalInit?: EditorState | Snapshot;
}
export declare const commands: Facet<TypableCommand[], TypableCommand[]>;   // `:` command line commands
export interface TypableCommand { name: string; aliases?: string[]; help: string; autocomplete?: (args: string[]) => string[]; handler(view: EditorView, args: any[]): CommandPanelMessage | void }
export declare const externalCommands: Facet<...>;   // file_picker, buffer_picker, :buffer-next, :buffer-previous, :buffer-close, global_search
export { resetMode };  // StateEffect that resets the engine to NORMAL mode (it is literally `MODE_EFF.NORMAL`)
export declare function snapshot(state, global?): Snapshot;
export declare function globalStateSync(state): TransactionSpec[];
export declare function readRegister(state, register: string): (string | Text)[] | undefined;
export declare const pathRegister: Facet<string | undefined>;
export { themeListener, changeTheme };
```

There is NO exported mode reader and NO exported effect for entering insert mode. `modeField` and `modeEffect` are module-private.

## Mode model (private, but observable)

- `modeField` value: `{ type, minor, count?, register?, expecting? }` with `type`: 0 Normal, 1 Insert, 4 Select; `minor`: 2 Normal, 3 Goto, 5 Match, 6 Space, 7 LeftBracket, 8 RightBracket.
- Statusline text (`toExternalMode`): "NOR" | "SEL" | "INS".

### Observable mode markers (candidates for the "normal-mode detection" helper)

1. **Scroll DOM class.** A ViewPlugin adds `cm-hx-block-cursor` to `view.scrollDOM` at construction, and when `editor.cursor-shape.insert === "bar"` toggles it on every mode change: present when mode is NOT insert, removed in insert mode. So with the bar cursor option, `view.scrollDOM.classList.contains("cm-hx-block-cursor")` is true in normal/select mode and false in insert mode. (With the default "block" cursor the class is never removed, so the bar option is required for this marker.)
2. **Statusline panel.** `showPanel.of(statusPanel)` creates `<div class="cm-hx-status-panel"><span>NOR|INS|SEL</span><span>register</span><span>line:col</span></div>` in `view.dom`. Updated by an `updateListener`, so it reflects the state after each transaction. First span text "INS" means insert mode.
3. **Cursor decorations.** In non-insert modes (or block cursor), `Decoration.mark({class: "cm-hx-cursor"})` marks are drawn; with bar cursor in insert mode they are empty.

Marker 1 is the simplest and is purely a DOM class check; marker 2 is more explicit. Fall back to "not insert" if neither is present.

## How keys are dispatched

- `helixKeymap = keymap.of(toCodemirrorKeymap(helixCommandBindings))` is an ordinary CodeMirror keymap (default precedence, placed inside the `helix()` extension array). Every key the engine knows (including "Escape") has one `run` function that checks the mode: in insert mode only explicit insert bindings run (e.g. Escape → normal); otherwise normal/goto/match/space/bracket tables apply.
- Because it is a plain `keymap.of`, a keymap added with `Prec.high`/`Prec.highest` wins over it, and a keymap placed later at the same precedence loses. This is how both marimo's hotkeys (Ctrl-x etc.) and the personal remaps (issue 07) can be layered.
- `EditorState.allowMultipleSelections.of(true)` is included; `drawSelection` is included unless `drawSelection: false`.
- When the editor is created with a non-empty doc, the plugin dispatches `selection: EditorSelection.range(1, 0)` in a `setTimeout` (selects the first character, Helix style).
- Escape in normal mode: handled by the engine (collapses/keeps selection per Helix semantics) and returns true, so CodeMirror calls `preventDefault()`. CodeMirror does NOT stop propagation of keydown, so a React `onKeyDown` on an ancestor element still sees the event (this is how the existing cell editor navigation hook intercepts keys for the vim preset; verify in `useCellEditorNavigationProps`).

## Entering insert mode programmatically

No exported effect. Options, in order of preference:
- Use `runScopeHandlers(view, new KeyboardEvent("keydown", { key: "i" }), "editor")` from `@codemirror/view` (public API) after focusing the editor: it runs the engine's keymap exactly as if the user pressed `i` in normal mode.
- Or dispatch a real `KeyboardEvent` to `view.contentDOM`.

## Returning to normal mode programmatically

`view.dispatch({ effects: resetMode })` (exported `resetMode` is the NORMAL mode effect).

## `:` commands

`commands.of([{ name: "w", aliases: ["write"], help: "...", handler(view) { ... } }])`. The handler may return `{ message, error? }` to show in the command panel. Built-in commands include `goto`/`g`, `clipboard-yank`, `clear-register`, `theme`, and the external ones.

## CSS class names (library-owned, keep them so user CSS can target them)

`cm-hx-status-panel`, `cm-hx-command-panel`, `cm-hx-command-input`, `cm-hx-command-popup`, `cm-hx-command-popup-wrapper`, `cm-hx-command-panel-flex`, `cm-hx-command-help`, `cm-hx-command-autocomplete`, `cm-hx-selected-option`, `cm-hx-block-cursor` (on scrollDOM), `cm-hx-cursor`, `cm-hx-cursor-endline`.

The library theme sets `.cm-hx-block-cursor .cm-cursor { display: none !important }` and `.cm-hx-block-cursor .cm-hx-cursor { background: #ccc }`.
