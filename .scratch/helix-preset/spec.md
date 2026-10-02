# Helix keymap preset with a Helix-flavoured cell command mode

## Problem Statement

I edit code in Helix, and marimo only offers `default` and `vim` keymap presets. The vim preset is built on a verb-then-motion engine, so remapping its keys to look like Helix (the workaround the maintainers suggest in upstream issue 9964) still breaks my muscle memory in exactly the places Helix differs: selection-first editing (`w d`, `f x d`), `x` extending lines, `s` selecting inside a selection, and multiple cursors. Outside the editor, marimo's command mode for navigating and rearranging cells is also vim-shaped (`dd`, `yy`, Shift-j/k to extend) and does not match how I move lines around in Helix.

Upstream has said first-class Helix support is unlikely in the short term, so this lives in my fork.

## Solution

Add a third keymap preset, `helix`, that uses the `codemirror-helix` engine inside every cell editor, and give that preset its own cell command mode whose keys follow Helix conventions: `j`/`k` to move focus, `J`/`K` to move cells, `d`/`y`/`p`/`P` to cut, yank and paste cells, `o`/`O` to create cells, `x`/`X` and `v` to build multi-cell selections, and a plain Escape in normal mode to leave the editor. A small set of `:` commands (`:w`, `:q`, `:wq`) bridges the Helix command line to the notebook.

The preset is selected with `preset = "helix"` in the `[keymap]` section of the marimo config, exactly like `vim` today.

## User Stories

### Selecting the preset

1. As a Helix user, I want to set `preset = "helix"` in my marimo config, so that every cell editor uses Helix keybindings.
2. As a Helix user, I want the config schema, Python config types and the OpenAPI document to accept `helix`, so that the setting round-trips through the settings UI and the server without validation errors.
3. As a Helix user, I want the `helix` preset to appear next to `default` and `vim` in the settings UI keymap dropdown, so that I can switch without editing TOML.
4. As a marimo user who does not use Helix, I want the `default` and `vim` presets to behave exactly as before, so that this feature does not regress my workflow.

### Editing inside a cell

5. As a Helix user, I want selection-first editing (motions extend a selection, then a verb acts on it), so that `w d`, `e y`, `f x c` and similar sequences work as they do in Helix.
6. As a Helix user, I want multiple cursors (`C`, `s` select-in-selection, `,` to collapse to primary), so that I can edit several places in a cell at once.
7. As a Helix user, I want insert mode to show a bar cursor and normal mode a block cursor, so that I can tell the mode without a statusline.
8. As a Helix user, I want the per-editor Helix statusline to be hideable with CSS, so that a notebook with many cells is not covered in status bars.
9. As a Helix user, I want the Helix `:` command line to work inside a cell, so that I can type commands I already know.
10. As a Helix user, I want `:w` to save the notebook, so that saving matches my Helix finger memory.
11. As a Helix user, I want `:q` to leave the editor and return to cell command mode, so that quitting a buffer maps to leaving the cell.
12. As a Helix user, I want `:wq` to save and then leave the editor, so that the common combined command works.
13. As a Helix user, I want Escape in insert mode to return to normal mode, so that the basic modal loop works on every platform (upstream draft PR 5202 had reports of this failing on macOS).
14. As a Helix user, I want Escape in normal mode to leave the editor and enter cell command mode in a single press, even when a selection is active, so that one key always means "leave".
15. As a Helix user, I want pressing `j` on the last line or `k` on the first line to stay inside the editor, so that navigation between cells only happens from cell command mode.
16. As a Helix user, I want marimo's modifier hotkeys inside the editor (Ctrl-x completion, run cell, format, toggle comment, and the other configured overrides) to keep working, so that the preset only changes modal editing and not notebook actions.
17. As a Helix user, I want the AI edit button not to pop up every time the engine creates a selection in normal mode, so that normal-mode cursor movement is not covered by UI chrome (a bug noted on upstream draft PR 5202).

### Entering a cell from command mode

18. As a Helix user, I want Enter on a selected cell to open its editor in normal mode, so that I can start with motions.
19. As a Helix user, I want `i` on a selected cell to open its editor in insert mode, so that I can start typing immediately.

### Navigating cells in command mode

20. As a Helix user, I want `j` and `k` in cell command mode to move focus to the next and previous cell, so that I can walk the notebook without arrow keys.
21. As a Helix user, I want `h` and `l` to move focus to the adjacent column in multi-column layouts, so that column navigation matches the vim preset.
22. As a Helix user, I want `gg` and `G` to jump to the first and last cell, so that long notebooks are quick to traverse.
23. As a Helix user, I want the existing arrow-key and modifier-key navigation to keep working alongside the letter keys, so that nothing is taken away.

### Rearranging cells in command mode

24. As a Helix user, I want `J` and `K` to move the focused cell down and up, so that reordering is a single keypress.
25. As a Helix user, I want `J` and `K` to do nothing while more than one cell is selected, so that a block selection is never silently split by moving only the focused cell.
26. As a Helix user, I want `d` to copy the focused cell (or the whole selection) to the clipboard and delete it immediately, so that `d` then `p` moves cells the way `d` then `p` moves lines in Helix.
27. As a Helix user, I want `d` to refuse to delete a running or queued cell, so that I cannot kill in-flight work by accident.
28. As a Helix user, I want `u` to restore the most recently deleted cell, so that a mistaken `d` is recoverable.
29. As a Helix user, I want `y` to copy the focused cell (or the whole selection) to the clipboard without deleting, so that I can duplicate cells.
30. As a Helix user, I want `p` to paste clipboard cells after the focused cell and `P` to paste before it, so that paste direction matches Helix.
31. As a Helix user, I want cell copy and paste to use the system clipboard like marimo's existing cell copy and paste, so that cells can also be moved between notebooks.
32. As a Helix user, I want `o` to create an empty cell below the focused cell and open its editor, and `O` to do the same above, so that adding cells matches opening lines in Helix.

### Multi-cell selection in command mode

33. As a Helix user, I want `x` to extend the selection to include the next cell and `X` the previous cell, so that growing a selection matches extending lines in Helix.
34. As a Helix user, I want `v` to toggle a select mode in which `j` and `k` extend the selection instead of moving focus, so that `v j j y` yanks three cells.
35. As a Helix user, I want pressing `v` again to leave select mode while keeping the current selection, so that I can switch back to focus movement without losing what I selected.
36. As a Helix user, I want Escape in command mode to clear the selection and leave select mode, so that one key resets to a single focused cell.
37. As a Helix user, I want `d` and `y` to act on the whole selection and then leave select mode, so that a consumed selection does not leave me in a stale mode.
38. As a Helix user, I want select mode to be visible as a distinct selection ring colour, so that I can tell I pressed `v` even when only one cell is selected.
39. As a theme author, I want select mode exposed as a data attribute on the cell, so that custom CSS can style it.

### Things that must not happen

40. As a Helix user, I want `s` in cell command mode not to save the notebook, so that a Helix select key never triggers a save; Ctrl-s remains the save shortcut.
41. As a Helix user, I want count prefixes such as `3j` to be ignored rather than misinterpreted, so that stray digits do nothing.
42. As a user of the vim preset, I want the vim command-mode table left untouched, so that the Helix table cannot leak into vim behaviour.

## Implementation Decisions

- **Engine.** The editor side uses the `codemirror-helix` package (0.6.x) as a new frontend dependency. The preset's extension bundle contains the Helix extension configured with a bar insert cursor and the `drawSelection` option left to the library, marimo's default keymap minus the keys the engine owns, marimo's override keymap for configurable hotkeys, a `:` command facet providing `w`, `q` and `wq`, and an Escape handler.
- **Preset wiring.** `KEYMAP_PRESETS` gains `helix`; the keymap bundle switch gains a `helix` case; the frontend config schema, the Python `KeymapConfig` literal, its docstring, and the OpenAPI document all accept `helix`. The cell editor navigation hook, which already branches on preset for the exit-to-command-mode key, treats `helix` as "plain Escape exits when in normal mode".
- **Normal-mode detection.** `codemirror-helix` exports no public mode reader. The Escape handler decides "normal mode" by observing the engine's own state: the agreed approach is to inspect the editor's DOM or state for the mode marker the library maintains for its cursor and statusline, falling back to "not insert" if the marker is absent. This is an implementation detail isolated in one helper so it can be swapped when the library gains a public API.
- **Boundary jumps disabled.** The Helix preset does not include the vim preset's "j on last line moves to next cell" keymap extension.
- **Cell command mode.** The cell navigation hook, which already contains a vim key table dispatched through the key-sequence matcher, gains a parallel Helix table selected when the preset is `helix`. The table is: `j`/`k` focus, `h`/`l` columns, `g g`/`shift+g` top and bottom, `shift+j`/`shift+k` move cell (no-op when more than one cell is selected), `d` copy-then-delete, `y` copy, `p`/`shift+p` paste after/before, `o`/`shift+o` create below/above with autofocus, `u` undo delete, `x`/`shift+x` extend selection down/up, `v` toggle select mode, `i` enter insert mode, `shift+enter` and other existing shortcuts unchanged. Escape clears selection and select mode before falling through to marimo's existing Escape handling. The existing `s` save binding is not included in the Helix table.
- **Select mode state.** A small piece of per-notebook state records whether select mode is active. It is cleared by Escape, by `d` and `y`, and toggled by `v`. While active, `j`/`k` call the existing selection-extend handlers instead of the focus handlers. The cell wrapper exposes it as a data attribute (for example `data-select-mode`) next to the existing `data-selected` attribute, and the default stylesheet gives it a distinct ring colour.
- **Delete semantics.** `d` reuses the existing copy-cells clipboard function and the existing delete-cells action with the running-cell guard, without the two-press pending-delete flow; destructive delete is implied by choosing the Helix preset. Undo uses the existing undo-delete-cell action.
- **Entering insert mode from `i`.** After focusing the editor, dispatch the engine's insert-mode transition so the editor opens in insert mode; Enter focuses without that transition.
- **Styling hooks.** The engine's statusline and command-line panels keep their library class names so user CSS can hide the statusline; the fork's default stylesheet does not hide it.
- **No upstream PR.** The fork tracks tag 0.24.2 on a `helix` branch, bumped deliberately. A second, non-upstreamable commit on the branch layers the maintainer's personal remaps (`x` extend line, `G` goto end, `_` goto word, `-` trim selections) as a higher-precedence keymap over the engine. That commit is outside this spec's test scope.
- **Consumers outside this repo.** The nix override in home-manager that builds the fork's frontend, the switch of the personal marimo config to `preset = "helix"` with the Alt-key overrides removed, and the Catppuccin CSS rules that hide the statusline and colour the select-mode ring are tracked separately in those repositories.

## Testing Decisions

A good test drives the public surface a user touches (a keyboard event on a cell, a config value, an extension list) and asserts on observable results (which store action ran, which cell is focused, what the clipboard received, what the schema accepts). Tests do not reach into the engine's internals or assert on generated class names.

Seams, all existing:

- **Cell command mode: the cell navigation props hook.** Render the hook with the store's keymap preset set to `helix`, fire keydown events, and assert on the mocked cell actions, clipboard functions and selection state. Prior art: the "vim mode navigation" block in the navigation hook tests, which does exactly this for the vim table. Every user story in the navigation, rearranging and multi-cell selection sections is tested here, including the no-op `J`/`K` with a multi-selection, the running-cell guard on `d`, select-mode toggling and the data attribute.
- **Editor side: the cell editor navigation props hook and the keymap bundle.** The editor hook tests already cover the preset-dependent exit key; they gain cases for `helix` (Escape exits in normal mode, does not exit in insert mode). The keymap bundle tests already assert on the composition of the default and vim bundles through the exported testing surface; they gain assertions that the `helix` bundle contains the engine extension, the `:` command facet with `w`/`q`/`wq`, and no boundary-jump extension.
- **Config: Python config tests.** The existing config tests that construct a `PartialMarimoConfig` with `preset = "vim"` gain a `helix` case, and the config reader round-trip test covers a `helix` TOML.

Not automated: a headless-browser smoke check (the same `marimo edit --headless` plus headless Chromium approach used to verify the theme) confirms the engine loads, Escape leaves insert mode, and the AI edit button stays hidden during normal-mode selection. Playwright end-to-end coverage is not added.

## Out of Scope

- Upstreaming the preset or reviving upstream draft PR 5202.
- A Helix statusline or command line that spans the notebook rather than one editor.
- Count prefixes (`3j`, `2dd`) in cell command mode.
- Bulk move of a multi-cell selection with `J`/`K`.
- A private cell register separate from the system clipboard.
- Porting Helix space-menu bindings or any project-level Helix commands (file picker, global search, buffer switching).
- Configurable Helix keymaps; the engine has no keymap config and the personal remaps are a separate commit.
- Removing marimo's existing `a`/`b`/`c`/`x`/`v` command-mode hotkeys for the Helix preset; `a` and `b` remain as duplicates of `O`/`o`. Note that the Helix table's `x` and `v` shadow marimo's cut and paste hotkeys because the preset table is matched first, which is intended.
- The nix build of the fork and the dotfiles config changes (tracked in their own repositories).

## Further Notes

- Decided through a grilling session on 2026-10-02; the design tree is fully settled.
- Upstream context: issue marimo-team/marimo#9964 (open) and draft PR marimo-team/marimo#5202 (closed stale). The PR's diff is a useful starting point for the preset wiring but predates the current keymap bundle and navigation hook.
- The repo's own guidelines apply: run `make check` before committing, no autonomous PRs, keep comments to "why".
