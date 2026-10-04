---
status: accepted
---

# Track linewise registers with a per-view side channel, not the engine's own state

`codemirror-helix` has no linewise register concept: `y`/`p`/`P` are purely
characterwise, and the library exports none of `yank`, `paste`, `modeField`,
or the register store, only a read-only `readRegister`. Duplicating a cell's
last line (`x y p`) therefore merges onto one line instead of landing below
it, since the yanked text has no trailing newline to carry and nothing
synthesizes one on paste.

We considered re-deriving "is this paste linewise" purely from the live
selection at paste time, but that silently breaks the common
yank-then-move-then-paste sequence, since linewise-ness is a property of
the register, not of whatever is selected when `p` is pressed. Since we
can't write into the engine's own register, we maintain our own per-view
`StateField` holding the content last yanked from an all-whole-line
selection, and consulted at paste time by re-reading the register's live
content via `readRegister` and requiring an exact match before trusting the
stash. Scoped to the default (unnamed) register only: the stash holds one
value, not one per register name, and `y`/`p`/`P` bail out immediately
whenever a `"<char>` register prefix is active, read off the statusline's
`reg=` text the same way the file already reads engine-internal mode state
elsewhere.

We also considered invalidating the stash proactively via an `updateListener`
whenever the register's observed content changed without our own marker
attached. We dropped this: it can't actually detect the one case it was for
(an unrelated yank producing text byte-identical to the stashed line), since
there is nothing to diff against, and closing that properly would mean
hand-enumerating every register-writing key in the engine (`y`, `d`, `c`,
`D`, `C`, `s`, register-prefixed variants) and keeping that list in sync with
a dependency we don't control. Plain content-equality at paste time is
accepted with that narrow, rare residual risk instead. The `"+"` (system
clipboard) register is excluded, since reading it back synchronously isn't
exported either.

This is reversible if `codemirror-helix` ever exposes a native linewise
register; until then it's the only option its exported surface allows.
