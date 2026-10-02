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
