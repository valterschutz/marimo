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

## Result

The remaps live in `frontend/src/core/codemirror/keymaps/helix-personal-remaps.ts`
and are added to the `helix` keymap bundle only (one line in `keymaps.ts`), so
dropping the commit removes them cleanly. Nothing else in the preset changed.

`codemirror-helix` has no keymap config and exports none of its commands, and
it has no `goto_word` at all (no `gw`; its `_` is a simpler trim). So the four
keys are ports of the Helix commands of the same name, written against
CodeMirror selections:

- `x` `extend_line`: selects the lines under each range. If they are already
  selected, it extends one line in the direction of the primary range, so
  `Alt-;` then `x` grows the selection upward. The engine's own `x` is
  `extend_line_below`.
- `G` `goto_file_end`: moves to the end of the cell, or extends to it in select
  mode.
- `_` `goto_word`: two-letter jump labels (`aa`, `ab`, ...) on the visible words
  that have two or more word characters. Labels go nearest-first, alternating
  forward and backward from the cursor, and skip the word under the cursor. Two
  letters select that word. Any other key cancels and is consumed, so Escape
  clears the labels without leaving the editor. Blurring the editor, editing
  and selection changes also clear them.
- `-` `trim_selections`: trims whitespace at both ends of every range. Ranges
  that are only whitespace are dropped, and if none are left the selection
  collapses to the primary cursor.

The bindings sit at `Prec.high` above the engine's keymap. The label key capture
sits at `Prec.highest`. The bindings only fire in normal or select mode with
nothing pending: no count, no `g`/`m`/space prefix, and no `f`/`t`/`r`
argument. That way `f-`, `tx` and `r_` still mean what they do in Helix, and
insert mode types the characters. The engine exposes pending state only in
its command panel. `isIdleInHelixNormalMode` reads that span, the same
DOM-reading approach as `isInHelixNormalMode`. With a count pending (`3x`) the
engine's own binding runs instead.

Decision left open by the spec: the engine stores a one-character cursor as a
backward range. Helix treats that range as forward, so direction checks count a
one-cluster range as forward. Without this, `x` from a plain cursor would
extend upward.

Headless smoke check (rebuilt frontend, `preset = "helix"`, cell
`alpha = 1 / beta = 2 / gamma = alpha - beta`, Playwright + Chromium):

```
PASS editor focused in normal mode
PASS x selects the current line -- [[0,10]]
PASS x again extends one line down -- [[0,19]]
PASS x on a backward line selection extends up (anchor kept) -- [[19,0]]
PASS x on a backward last-line selection extends up -- [[39,10]]
PASS G moves to the end of the cell -- [[39,39]]
PASS G in select mode extends to the end -- {"ranges":[[0,39]],"mode":"SEL"}
PASS - trims the trailing newline off a line selection -- [[0,18]]
PASS - drops whitespace-only selections and collapses to the primary cursor
PASS _ shows jump labels on visible words -- {"labels":"aaabacad"}
PASS typing a label selects its word -- {"ranges":[[19,24]],"labels":""}
PASS Escape cancels labels and stays in the editor
PASS f- still finds the '-' character -- {"ranges":[[0,34]],"dash":33}
PASS insert mode types x _ G - literally
PASS undo restores the cell
ALL PASS
```

A screenshot confirmed the labels render over the first two characters of
`beta`, `gamma`, `alpha` and `beta` in bold red (`.cm-jump-label`, which user
CSS can restyle). No unit tests were added, per the issue.
