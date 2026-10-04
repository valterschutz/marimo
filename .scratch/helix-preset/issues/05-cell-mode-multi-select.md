## Parent

#1

## What to build

In Helix cell command mode, `x` extends the selection to the next cell and `X` to the previous one. `v` toggles select mode, in which `j`/`k` extend the selection instead of moving focus; `v` again leaves select mode but keeps the selection. Escape clears the selection and leaves select mode. `d` and `y` act on the whole selection and then leave select mode. `J`/`K` do nothing while more than one cell is selected. Select mode is visible as a distinct selection ring colour, and exposed as a data attribute on the cell so custom CSS can style it.

## Acceptance criteria

- [ ] A per-notebook select-mode state exists; it is toggled by `v`, cleared by Escape, `d`, and `y`.
- [ ] Cell navigation hook tests with the `helix` preset cover `x`, `shift+x`, `v` toggling, `j`/`k` extending while in select mode, `v` again keeping the selection, Escape clearing both, `d`/`y` consuming the selection and leaving select mode, and `shift+j`/`shift+k` being no-ops with a multi-selection.
- [ ] The cell wrapper exposes a select-mode data attribute next to the existing selected attribute, and the default stylesheet gives it a distinct ring colour.
- [ ] `make check` passes.

## Blocked by

- #REARR

## Result

Select mode is a `selectMode` flag on the existing cell selection reducer state in `frontend/src/components/editor/navigation/selection.ts`, with a `setSelectMode` action, a `useIsSelectMode` hook and a `getIsSelectMode(store)` reader. `select` and `extend` keep the flag; `clear` resets it together with the selection, so every existing path that clears the selection (Escape, arrow/`h`/`l`/`gg`/`G` focus moves, Enter/`i`, the multi-cell toolbar) also leaves select mode.

The Helix table in `command-mode-keymap.ts` gained `x`/`shift+x` (the existing `Shift+ArrowDown`/`Shift+ArrowUp` extend handlers), `v` (toggle select mode; entering it selects the focused cell if it isn't selected, so the ring is always visible; leaving it keeps the selection), and `j`/`k` that extend instead of moving focus while select mode is active. `d` (on success) and `y` leave select mode and keep the selection. `shift+j`/`shift+k` remain no-ops with a multi-cell selection (from #REARR). Escape in command mode now also clears when select mode is active but the focused cell isn't selected.

`useCellNavigationProps` exposes `data-select-mode` next to `data-selected` on the cell wrapper, and its default classes add `data-[selected=true]:data-[select-mode=true]:ring-(--orange-8)`, which overrides the blue ring by specificity (verified with the Tailwind compiler).

Decisions the spec left open: select mode is reset by anything that clears the selection, not only Escape/`d`/`y`; `d` refused on a running cell does not leave select mode; `data-select-mode` reflects the notebook-wide state on every cell (not only selected ones), so theme CSS can combine it with `data-selected` or style unselected cells; ring colour is `--orange-8`.

Tests: `selection.test.ts` covers the new reducer field and action; the "helix mode navigation > multi-cell selection" block in `navigation.test.ts` covers `x`, `shift+x`, `v` on/off, `j`/`k` extending in select mode, `j` moving focus after `v` off, Escape clearing both, `d`/`y` consuming the selection and leaving select mode, `shift+j`/`shift+k` no-ops with a multi-selection, and the data attribute. The `useCellNavigationProps` `beforeEach` now resets config overrides, because the vim/helix preset overrides leaked into later describes and Helix `x` shadowed the bulk cut test.

`make check` exits 0 (the same pre-existing ruff findings in untouched Python files are reported but do not fail the target). `pnpm vitest run src/components/editor/navigation`: 6 files, 159 tests passed.

Superseded by #08 (cell-mode-move-selection): `shift+j`/`shift+k` now move the whole cell selection as a block instead of being no-ops with a multi-cell selection.
