## Parent

#1

## What to build

In Helix cell command mode, `J`/`K` move the focused cell down/up. `d` copies the focused cell to the system clipboard and deletes it immediately, refusing when the cell is running or queued. `y` copies without deleting. `p`/`P` paste clipboard cells after/before the focused cell. `u` restores the most recently deleted cell. Together, `d` then `p` moves a cell the way it moves a line in Helix.

## Acceptance criteria

- [ ] Cell navigation hook tests with the `helix` preset cover `shift+j`, `shift+k`, `d`, `y`, `p`, `shift+p`, `u`, asserting on the mocked move, clipboard, delete and undo-delete actions.
- [ ] `d` is a single press: no pending-delete confirmation step.
- [ ] `d` on a running or queued cell neither copies nor deletes; a test covers this.
- [ ] Copy and paste reuse marimo's existing system-clipboard cell functions.
- [ ] `make check` passes.

## Blocked by

- #NAV

## Result

Implemented in `frontend/src/components/editor/navigation/command-mode-keymap.ts` and `navigation.ts`. The Helix command-mode table gained `shift+j`/`shift+k` (move cell down/up, no-op when the selection has more than one cell), `d` (copy to clipboard then delete immediately, reusing `copyCells` and the existing `useDeleteManyCellsCallback`, refusing on a running/queued cell), `y` (copy only), `p`/`shift+p` (paste after/before, reusing `pasteAtCell`), and `u` (reusing `undoDeleteCell`). The running-cell guard and cell-id-to-delete computation were extracted from the existing `cell.delete` shortcut into a shared `getCellIdsToDelete` helper so Helix's single-press `d` and the pre-existing pending-delete flow share the same guard. `shift+j`/`shift+k` reuse the boundary-checked `cell.moveUp`/`cell.moveDown` handlers for the single-cell case.

Tests added to `frontend/src/components/editor/navigation/__tests__/navigation.test.ts` under "helix mode navigation" cover `shift+j`, `shift+k` (including the no-op with a multi-cell selection), `d` (single cell, a selection, and the running-cell refusal), `y`, `p`, `shift+p`, and `u`.

`make check` passes (pre-existing, unrelated `context-manager-iterator` ruff findings in untouched files do not fail the target). `pnpm vitest run` for the navigation test file: 101 passed.

Superseded by #08 (cell-mode-move-selection): `shift+j`/`shift+k` now move the whole cell selection as a block instead of being no-ops with a multi-cell selection.
