## Parent

#1

## What to build

With the `helix` preset, once the user has left an editor they are in cell command mode with Helix-shaped keys: `j`/`k` move focus to the next/previous cell, `h`/`l` move to the adjacent column, `gg`/`G` jump to the first/last cell. Enter opens the focused cell's editor in normal mode, `i` opens it in insert mode, `o`/`O` create an empty cell below/above and open it. `s` does nothing (Ctrl-s remains save). Arrow keys and modifier shortcuts keep working. The vim table is untouched.

## Acceptance criteria

- [ ] A Helix command-mode table exists beside the vim table and is selected when the preset is `helix`.
- [ ] Cell navigation hook tests, rendered with the preset set to `helix`, cover `j`, `k`, `h`, `l`, `g g`, `shift+g`, Enter, `i`, `o`, `shift+o`.
- [ ] `i` results in the editor opening in insert mode; Enter in normal mode.
- [ ] `s` in Helix cell mode does not save; a test asserts the save action is not called.
- [ ] Vim navigation tests pass unchanged; `make check` passes.

## Blocked by

- #PREFACTOR
- #PRESET

## Result

Implemented.

### What was built

- `frontend/src/components/editor/navigation/command-mode-keymap.ts`: `getHelixCommandModeTable`, selected by `getCommandModeKeySequenceTable` for `helix`, beside the untouched vim table. Keys: `j`/`k`, `h`/`l`, `g g`/`shift+g` reuse the shared focus handlers; `i` calls the new `focusEditorInInsertMode` handler; `o`/`shift+o` create a cell below/above and open its editor in insert mode.
- `frontend/src/core/codemirror/keymaps/helix.ts`: `setHelixMode(view, "normal" | "insert")`. It runs the engine's own bindings through the public `runScopeHandlers`: Escape (pressed a second time if the first only cancelled an insert-mode prefix such as Ctrl-r), then `i` for insert. The exported `resetMode` effect was rejected because it skips the engine's commit of a pending insert to its undo history. In the development build the next insert then throws `Unexpected temp`.
- `frontend/src/components/editor/navigation/navigation.ts`: Enter and `i` share a `focusEditor(helixMode)` helper. With the `helix` preset, Enter opens the editor in normal mode and `i` in insert mode. The `s` save keymap returns false for `helix`, so `s` falls through unhandled. Ctrl-s/Cmd-s (`global.save`) is a separate global hotkey and is unaffected.

### Decisions the spec left open

- Enter forces normal mode instead of only "not entering insert". The engine keeps its mode while unfocused, so an editor left in insert mode (by clicking elsewhere or Shift-Enter) would otherwise reopen in insert mode.
- `o`/`O` open the new cell's editor in insert mode. This is option B, chosen by the supervisor. `createNewCell({ autoFocus: true })` alone keeps cell-level focus when a cell is focused (`focusAndScrollCellIntoView`), which is also what vim `o` and default `a`/`b` do today. The Helix table passes an explicit `newCellId`, then retries (`retryWithTimeout`, 10 × 20 ms) with `ensureCellEditorView` until the editor is built and attached and focus sticks. It sets insert mode once, on first sight of the view. If the editor never mounts, focus stays on the new cell. Vim and default behaviour are unchanged.

### Tests

- `navigation.test.ts`, new `helix mode navigation` block: `j`, `k`, `h`, `l` (multi-column), `g g`, `shift+g`, Enter (normal mode requested), `i` (insert mode requested), `o`/`shift+o` (new cell id, editor focused, insert mode requested), deferred editor mount for `o`, `s` does not call save, and ArrowDown and Ctrl-Enter still work. The existing vim navigation tests are unchanged and pass.
- `keymaps/__tests__/helix.test.ts` (new) tests `setHelixMode` against the real engine: insert from normal without editing the doc, insert while a `g` prefix is pending, idempotent insert, normal from insert, normal from a pending Ctrl-r prefix, and the insert still undoable after a normal/insert round-trip. Removing the second Escape was confirmed to fail the Ctrl-r case.
- `keymaps.test.ts`: `setHelixMode` round-trips inside the full `helix` keymap bundle.

### Headless smoke check

Ran `make fe`, then `marimo edit --headless` with `preset = "helix"` on a 3-cell notebook, driven by Playwright and headless Chromium. 15/15 passed: `j`, `k`, `G`, `gg` move cell focus. `i` opens the editor in insert mode without typing an `i`, and typing edits the doc. After leaving an editor in insert mode by clicking another cell, Enter reopens it in normal mode and `u` undoes the earlier insert. `o` and `O` create a cell below/above with its editor focused in insert mode. `s` sends no save request. ArrowDown still moves focus.
