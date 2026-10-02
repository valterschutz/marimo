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
