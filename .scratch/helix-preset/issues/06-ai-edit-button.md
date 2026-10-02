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

## Result

**Reproduced.** Headless smoke check: `make fe` build of the branch, a temp
directory with `.marimo.toml` (`[keymap] preset = "helix"`, `[ai]
inline_tooltip = true`, `[ai.models] chat_model`/`edit_model` set so AI
features are enabled, a dummy OpenAI key) and a two-cell notebook, served with
`marimo edit --headless --no-token --port 2718 nb.py` from that directory and
driven by Playwright (`@playwright/test` from `frontend/node_modules`, headless
Chromium from `~/.nix-profile/bin/chromium`). The script clicked into the first
cell, pressed keys, and after each step read the statusline mode and the
computed style of `.cm-ai-tooltip-button`.

Before the fix (mode / trigger visible):

| step | mode | trigger |
| --- | --- | --- |
| mouse click into cell | NOR | visible |
| `l`, `w`, `j`, `h` motions | NOR | visible after each |
| `i` | INS | hidden (selection collapsed) |
| Shift+ArrowRight x2 | INS | visible |
| Escape | NOR | visible |
| mouse drag | NOR | visible |
| `l` after the drag | NOR | visible |

Cause: `codemirror-helix` keeps a non-empty primary selection after every
normal-mode motion, and `@marimo-team/codemirror-ai`'s trigger plugin shows the
button whenever any selection range is non-empty.

**Fix.** `hideAiEditTriggerInHelixNormalMode()` in
`frontend/src/core/codemirror/keymaps/helix.ts`, added by `setupCodeMirror` in
`cm.ts` next to the AI trigger only for the `helix` preset and only when the
inline AI tooltip is enabled. It tracks whether the current selection was set
by the pointer (`select.pointer` user event) in a `StateField`, and an update
listener toggles a `data-hide-ai-edit-trigger` attribute on the editor element
when the engine is in normal mode (via `isInHelixNormalMode`) and the selection
came from the keyboard. A theme rule hides `.cm-ai-tooltip-button` under that
attribute with `!important`, which beats the inline `display: flex` the trigger
plugin sets. An attribute is used instead of a class because CodeMirror rewrites
the editor's `class` attribute on focus changes. The listener must come after
the engine so it reads the statusline after the engine has updated it; the
`cm.ts` placement guarantees that.

After the fix, same script on a rebuilt frontend:

| step | mode | trigger |
| --- | --- | --- |
| mouse click into cell | NOR | visible (click gives a 1-char pointer selection) |
| `l`, `w`, `j`, `h` motions | NOR | hidden after each |
| `i` | INS | hidden |
| Shift+ArrowRight x2 | INS | visible |
| Escape | NOR | hidden |
| mouse drag | NOR | visible |
| `l` after the drag | NOR | hidden |

Default and vim presets are untouched: the extension is only added for `helix`,
and `setup.test.ts` now asserts a keyboard selection still shows the trigger
for both.

Decision left open by the spec: a bare mouse click in normal mode still shows
the trigger, because the engine turns the click into a one-character pointer
selection and pointer selections are deliberately exempt (acceptance criterion:
"an explicit mouse ... selection still can"). The next keyboard motion hides it.

Tests: `frontend/src/core/codemirror/keymaps/__tests__/helix.test.ts` (5 new
cases: normal-mode motion hides, insert-mode selection shows, Escape re-hides,
pointer selection shows then next motion hides, hidden state survives focus
changes) and `frontend/src/core/codemirror/__tests__/setup.test.ts` (helix hides
after a motion through `setupCodeMirror`; default and vim show for a keyboard
selection).
