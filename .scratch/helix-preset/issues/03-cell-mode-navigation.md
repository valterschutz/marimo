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
