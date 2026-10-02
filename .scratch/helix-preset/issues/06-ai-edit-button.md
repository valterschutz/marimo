## Parent

#1

## What to build

With the `helix` preset, moving the cursor in normal mode creates a non-empty selection in the engine. That must not pop marimo's AI edit button on every motion. Reproduce first (reported on upstream draft PR 5202); if it reproduces, suppress the trigger while the engine is in normal mode without affecting the default and vim presets.

## Acceptance criteria

- [ ] Reproduction result recorded in the ticket, with the headless-browser smoke check used.
- [ ] If reproduced: normal-mode motions in a Helix cell do not show the AI edit button; an explicit mouse or insert-mode selection still can, per existing behaviour.
- [ ] Default and vim preset behaviour for the AI edit button is unchanged, covered by existing tests.
- [ ] `make check` passes.

## Blocked by

- #PRESET
