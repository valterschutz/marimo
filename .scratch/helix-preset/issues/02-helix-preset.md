## Parent

#1

## What to build

A user can set `preset = "helix"` in the `[keymap]` config section (or pick it in the settings dropdown) and every cell editor then uses Helix keybindings via the `codemirror-helix` engine: selection-first motions, multiple cursors, bar cursor in insert mode. Escape in insert mode returns to normal mode; Escape in normal mode leaves the editor and enters cell command mode in one press, even with an active selection. Pressing `j` on the last line or `k` on the first line stays inside the editor. marimo's modifier hotkeys inside the editor (completion, run, format, toggle comment, configured overrides) keep working. The `default` and `vim` presets are unchanged.

## Acceptance criteria

- [ ] `helix` is accepted by the Python keymap config literal and docstring, the frontend config schema, the OpenAPI document, and appears in the settings UI keymap dropdown.
- [ ] Python config tests gain a `helix` case beside the existing `vim` cases, including a TOML round-trip.
- [ ] The keymap bundle has a `helix` case; bundle tests assert it contains the Helix engine extension, marimo's override keymap, and no boundary-jump extension.
- [ ] Insert cursor is a bar; the engine's statusline and command-line panels keep their library class names so user CSS can hide them.
- [ ] Normal-mode detection is isolated in one helper (the engine exports no mode reader).
- [ ] Cell editor navigation hook tests cover: Escape exits to command mode in normal mode, does not exit in insert mode, exits with a non-collapsed selection.
- [ ] Headless-browser smoke check performed and recorded in the ticket: engine loads, Escape leaves insert mode, Escape in normal mode blurs the editor.
- [ ] Existing default and vim preset tests pass; `make check` passes.

## Blocked by

- None (can start immediately).

## Result

Implemented. Dependency: `codemirror-helix@0.6.0` (lockfile diff limited to that one package plus its peer resolution).

### What was built

- `frontend/src/core/codemirror/keymaps/helix.ts` (new): `helixExtension()` returns the engine configured with `"editor.cursor-shape.insert": "bar"`, the `:` command facet with `w`/`q`/`wq` (aliases `write`, `quit`, `write-quit`/`x`), and a `domEventObservers` keydown observer that stops propagation of Escape while in insert mode. The observer is needed because the engine leaves insert mode before Escape reaches the cell's React handler, which would otherwise read normal mode and leave the editor on the same press.
- `isInHelixNormalMode(view)` is the single normal-mode helper. It reads the mode label the engine renders in its statusline (`NOR`/`SEL`/`INS`) and treats a missing statusline as "not insert". The engine exports no mode reader, so this is the swap point if it ever does.
- `onlyInHelixInsertMode(bindings)` wraps marimo's default keymap so it only applies in insert mode, leaving normal and select mode entirely to the engine. The `helix` bundle is: override keymap, engine, insert-mode-only default keymap. No boundary-jump extension, so `j`/`k` stay inside the editor.
- `useCellEditorNavigationProps` gained a `helix` branch: plain Escape exits when in normal mode, with no selection-simplifying step, so one press always leaves even with an active selection. Escape originating outside the editor's content DOM (the engine's `:` and `/` prompts) is ignored.
- Preset plumbing: `KEYMAP_PRESETS`, the frontend zod schema, the Python `KeymapConfig` literal and docstring, and the OpenAPI document (`api.yaml` and `src/api.ts`, edited to match generator output without the unrelated `anyOf` reordering that regenerating produces). The settings dropdown is driven by `KEYMAP_PRESETS`, so `helix` appears there automatically. `command-mode-keymap.ts` returns no table for `helix`; the Helix command-mode table is #NAV onward.

### Fix required outside the helix seams

`copilotBundle` unconditionally installed a `Prec.highest` Escape binding calling `rejectInlineCompletion`, which reads the inline completion state field. With copilot disabled that field is absent, so the command threw `RangeError: Field is not present in this state`, and the throw aborted CodeMirror's remaining Escape handlers. The Helix engine's Escape therefore never ran and insert mode could not be left at all. The binding is now installed only for the `github` and `custom` providers that add the field. The default preset hit the same throw but was masked by its React Escape handler. Covered by a new test in `copilot.test.ts`.

### Tests

- `frontend/src/core/codemirror/keymaps/__tests__/keymaps.test.ts`: engine loads in normal mode, bar insert cursor (block-cursor class drops in insert mode), override keymap present, `j`/`k` stay on the first and last line with no `moveToNextCell` call, default keymap applies in insert mode only, `:w`/`:q`/`:wq` present with `:w` calling `saveNotebook` and `:q` focusing the cell.
- `frontend/src/components/editor/navigation/__tests__/navigation.test.ts`: a `helix mode` block covering Escape exits in normal mode, does not exit in insert mode, exits on one press with a non-collapsed selection, ignores Escape from the engine's prompt, and exits immediately when no editor is mounted.
- `tests/_config/test_config.py`: the keymap case is parametrized over `vim` and `helix`. `tests/_config/test_manager.py`: `test_save_config_round_trips_helix_keymap` writes `preset = "helix"` to a TOML file and reads it back.

### Headless smoke check

Built with `make fe`, ran `marimo edit --headless --no-token --port 2718` in a temp directory with `preset = "helix"`, drove headless Chromium via Playwright. 19/19 checks passed:

- engine loads with one statusline and command panel per editor, both keeping their library class names
- clicking into an editor gives normal mode and a block cursor; `i` gives insert mode and drops the block-cursor class (bar cursor)
- typing edits the document in insert mode; Escape returns to normal mode and stays in the editor
- Escape in normal mode blurs the editor and focuses the cell; `Enter` reopens it in normal mode
- Escape leaves in a single press with a 26-character selection active
- `j` on the last line and `k` on the first line stay in the same editor
- `Ctrl-/` toggles comment in normal mode and toggles back; `Ctrl-Enter` in normal mode posts `/api/kernel/run`
- `:` opens the engine's prompt; Escape in the prompt keeps the editor focused; `:q` leaves to the cell; `:w` and `:wq` resolve with marimo's help text and no command error; `:wq` leaves the editor

Two things could not be observed headlessly, both verified to behave identically under the `default` preset and therefore not Helix-specific:

- Disk writes from `:w`. marimo's own `Ctrl-s` and its save button issue no save request in this environment (POSTs show `/api/document/transaction`, so the document is in collaborative-sync mode). `:w` calling `saveNotebook` is covered by the unit test instead.
- The completion popup via `Ctrl-Space`. No popup appears under either preset, so the language server is unavailable in this environment.

### Known divergence

Backspace in normal mode can still delete a character on a multi-line document. The binding comes from an extension outside the keymap bundle (bracket handling in the basic bundle), not from the default keymap the bundle filters, so fixing it is out of this issue's scope. The smoke script tracks it as an informational check.
