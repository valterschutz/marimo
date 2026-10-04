Status: closed

## Parent

#1

## Blocked by

- #MULTI

## Problem Statement

In my Helix fork, `J`/`K` move every line touched by the selection, so I can grab a block of lines and push it up or down with repeated presses. In marimo's Helix cell command mode, `J`/`K` move the focused cell, but as soon as I build a cell selection with `x`/`X` or cell select mode, `J`/`K` do nothing. To move a block of cells I have to fall back on `d` then `p`, which goes through the clipboard and loses the "nudge it into place" feel I rely on in the editor.

## Solution

In Helix cell command mode, `J`/`K` move the whole cell selection down/up by one position as a block, exactly like they already move a single focused cell. The cells stay selected and cell select mode stays as it was, so `J J J` keeps nudging the same block. When the block already sits at the bottom/top of its column, nothing moves and the key is left unconsumed, as in Helix where a block at the edge stays put.

## User Stories

1. As a Helix user in cell command mode, I want `J` to move the cell selection down by one position, so that I can rearrange a block of cells the way I move lines in Helix.
2. As a Helix user in cell command mode, I want `K` to move the cell selection up by one position, so that I can move a block of cells upward.
3. As a Helix user, I want the cells in the cell selection to keep their relative order when the block moves, so that moving never reshuffles the code I selected.
4. As a Helix user, I want the cell that `J` passes over to end up directly above the block, and the one `K` passes over directly below it, so that the move behaves like Helix's line move.
5. As a Helix user, I want the cells to remain selected after `J`/`K`, so that I can press `J`/`K` repeatedly to move the same block several positions.
6. As a Helix user in cell select mode, I want cell select mode to stay on after `J`/`K`, so that I can keep extending or moving without re-entering it.
7. As a Helix user outside cell select mode with a cell selection built by `x`/`X`, I want `J`/`K` to move it without entering cell select mode, so that moving does not change my mode.
8. As a Helix user, I want focus to stay on the same cell inside the block after a move, so that subsequent `x`/`X`/`j`/`k` act relative to where I was.
9. As a Helix user, I want `J` on a cell selection whose last cell is at the bottom of its column to do nothing, so that the block is never split or partially moved.
10. As a Helix user, I want `K` on a cell selection whose first cell is at the top of its column to do nothing, so that the block is never split or partially moved.
11. As a Helix user, I want `J`/`K` at a column edge to leave the key unconsumed, so that it behaves like the existing single-cell move at the edge.
12. As a Helix user with a single focused cell and no cell selection, I want `J`/`K` to keep moving just that cell, so that existing behaviour is unchanged.
13. As a Helix user with a one-cell cell selection, I want `J`/`K` to move that cell, so that a one-cell selection behaves like a focused cell.
14. As a Helix user in a multi-column notebook, I want `J`/`K` to move the cell selection only within its column, so that moving vertically never jumps columns.
15. As a Helix user, I want the notebook to scroll so the moved block stays in view, so that I can see where it landed.
16. As a Helix user, I want `d`/`y` after a move to still act on the whole moved selection, so that moving and then cutting or copying composes.
17. As a Helix user, I want Escape after a move to clear the cell selection and leave cell select mode as before, so that finishing a move works the usual way.
18. As a vim preset user, I want my cell command mode bindings unchanged, so that this feature only affects the Helix preset.
19. As a default preset user, I want nothing to change, so that this feature only affects the Helix preset.
20. As a Helix user, I want the global "Move cell up/down" shortcuts to keep working as before, so that the change is limited to `J`/`K` in Helix cell command mode.

## Implementation Decisions

- This is a change to the Helix preset's cell command-mode table, not to the personal remaps layer. It reverses the earlier "`J`/`K` are no-ops with a multi-cell selection" rule from #REARR and #MULTI; the reason for that rule (never silently split a selection) no longer applies because the whole block moves.
- `J`/`K` reuse the existing bulk "move cell down/up" hotkey handlers, which already take an ordered list of cell ids, refuse when the first/last cell is at the column edge, and apply moves in an order that preserves relative positions. No new cell action or reducer change is needed.
- The command-mode handlers interface exposes the move as taking the cells to move, not only the focused cell. When the cell selection has two or more cells, the Helix table passes them in column order (top to bottom); otherwise it passes the focused cell.
- The cell selection is a set of cell ids, always contiguous within one column, so selection, `selectionStart`/`selectionEnd` and focus all follow the moved cells without any update. Cell select mode is not touched by a move.
- At a column edge the handler returns false, so the key is not consumed, matching the single-cell case today.
- No count prefix support (`3J`) and no cross-column moves.
- Vocabulary: "cell selection" and "cell select mode" as defined in `CONTEXT.md`.

## Testing Decisions

- Good tests drive the cell through key events with the `helix` preset and assert on observable outcomes: which cell move actions were dispatched with which cells and in which order, whether the key was consumed, and the resulting cell selection and select-mode state. They do not assert on the internal shape of the command-mode table.
- One seam: the cell navigation hook tests, in the "helix mode navigation" block, the same place #REARR and #MULTI were tested. Prior art there: the existing `shift+j`/`shift+k` single-cell tests and the multi-cell selection block (`x`, `v`, `d`/`y` consuming the selection).
- Cases: `J`/`K` with a multi-cell selection move the block (bottom-to-top dispatch for `J`, top-to-bottom for `K`); `J` with the block at the bottom and `K` at the top move nothing and leave the key unconsumed; the cell selection and select mode survive a move, both in and out of cell select mode; a single focused cell still moves as before. The existing "no-op with a multi-selection" assertions are replaced by these.

## Out of Scope

- Count prefixes for `J`/`K` or any other cell command-mode key.
- `J`/`K` in editor normal mode moving lines inside a cell (a port of the Helix fork's `move_lines_down`/`move_lines_up`, with join and keep_selections moved to `C-j`/`C-k`). If wanted, that belongs in the personal remaps layer as its own issue.
- `J`/`K` from editor normal mode moving the whole cell.
- Moving a cell selection across columns.
- Changes to the vim or default presets.

## Further Notes

- After this lands, #REARR and #MULTI describe `J`/`K` as no-ops with a multi-cell selection; their Result sections should note that this issue superseded that rule.
- Run `make check` before committing.

## Result

In the Helix table in `frontend/src/components/editor/navigation/command-mode-keymap.ts`, `shift+j`/`shift+k` now pass the cell selection (or the focused cell when fewer than two cells are selected) to the handlers. `CommandModeKeymapHandlers.moveCellUp`/`moveCellDown` became `moveCellsUp(cellIds)`/`moveCellsDown(cellIds)`. In `navigation.ts` they call the existing `cell.moveUp`/`cell.moveDown` `bulkHandle`, which refuses at the column edge (so the key is not consumed) and dispatches `moveCell` bottom cell first for down and top cell first for up. The selection, focus and select mode are not touched, so they stay on the moved block. The vim table never used these handlers.

The selection set is already in column order because `extend` builds it from a column slice, and a block move keeps relative order, so it is passed as is. `y` reuses the same cells-to-act-on value.

Tests: the "helix mode navigation > multi-cell selection > moving the selection" block in `navigation.test.ts` covers `J`/`K` moving a block (dispatch order and key consumed), both column edges (nothing moves, key not consumed), selection and select mode surviving a move, and moving an `x`-built selection without entering select mode. These replace the two "no-op with a multi-selection" tests. The existing single-cell `J`/`K` tests still pass unchanged.

