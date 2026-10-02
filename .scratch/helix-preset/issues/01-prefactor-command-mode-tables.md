## Parent

#1

## What to build

No user-visible change. The vim command-mode key table (`j`, `k`, `dd`, `yy`, `p`, `o`, …) currently lives inline inside the cell navigation hook. Move the preset-specific tables into a function keyed by keymap preset, so that adding the Helix table later is a new entry beside the vim one rather than an edit to the hook body. The hook keeps dispatching through the existing key-sequence matcher.

## Acceptance criteria

- [ ] The vim command-mode table is produced by a preset-keyed function that receives the handlers it needs (focus, selection, clipboard, cell actions) and returns the key-to-handler map.
- [ ] The cell navigation hook selects the table by preset and dispatches it exactly as before; `default` preset yields no table.
- [ ] All existing cell navigation tests, including the "vim mode navigation" block, pass unchanged.
- [ ] `make check` passes.

## Blocked by

- None (can start immediately).

## Result

Implemented as a pure refactor on commit `1caa0b696`.

- Added `frontend/src/components/editor/navigation/command-mode-keymap.ts` exporting `getCommandModeKeySequenceTable(preset, handlers)`, which switches on `KeymapConfig["preset"]` and currently has one case (`vim`, via the private `getVimCommandModeTable`) plus `default` returning `undefined`; `logNever` guards the exhaustiveness switch so the Helix table (#PRESET) is a sibling `case "helix":` away.
- `useCellNavigationProps` in `navigation.ts` now builds a `CommandModeKeymapHandlers` object (the existing focus keymap table, `cellId`, `selectedCells`, the delete/copy/paste/create/undo handlers) and calls the new function instead of inlining the vim table; dispatch through `handleVimKeybinding` is unchanged.
- Vim command-mode behaviour is bit-for-bit identical: same key strings, same handler bodies, same `Record<string, () => boolean>` shape fed to the matcher.
- Verified: `pnpm vitest run src/components/editor/navigation/` (113 tests, including the "vim mode navigation" block) and `make check` (fe-check + py-check) both pass.
