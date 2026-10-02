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
