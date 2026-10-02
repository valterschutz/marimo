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
