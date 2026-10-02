## Parent

#1

## What to build

A single, clearly labelled non-upstreamable commit on the `helix` branch that layers the maintainer's personal Helix remaps over the engine with higher precedence: `x` extend line, `G` goto file end, `_` goto word, `-` trim selections. Kept separate so the preset commits stay clean and the remaps can be dropped or rebased independently.

## Acceptance criteria

- [ ] One commit, last on the branch, whose message states it is personal configuration and not for upstream.
- [ ] The four remaps work in a Helix cell, verified by hand in the headless-browser setup and recorded in the ticket.
- [ ] No unit tests are added; existing tests still pass; `make check` passes.

## Blocked by

- #PRESET
