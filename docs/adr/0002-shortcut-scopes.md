---
status: accepted
---

# Give every binding a shortcut scope, and keep cell actions out of the editor

Upstream binds most `cell.*` actions both inside the cell editor and in cell
command mode, so a key chosen for a cell-level action (say `o` for "new cell
below") also fires during editor focus, where it collides with typing and
with the Helix engine's own `o`. We split bindings into three shortcut
scopes: editor (editor focus only), cell command (cell command mode only)
and notebook (both). By default editor focus only edits the cell's text:
creating, deleting, moving and focusing cells live in cell command scope,
and only things that make sense while typing, such as running a cell or
saving, are in notebook scope.

We considered fixing each action's scope in its definition, which keeps the
config format unchanged, but chose to store the scope on each binding, so
one action can have several bindings in different scopes (`o` in cell
command scope and a modified key in notebook scope). Each action declares
which scopes it can run in; cursor-based actions offer editor scope only.

## Consequences

- `[keymap.overrides]` values may be a key string (the action's default
  scope), a `{ key, scope }` table, or a list of them. Plain strings keep
  their old meaning.
- Bare keys are rejected in editor and notebook scope, since they would
  shadow typing and the Helix engine. Space-separated key sequences
  (`g g`) are allowed in cell command scope only.
- The keymap presets' hardcoded cell command tables become per-preset
  default bindings of configurable actions, with the user's overrides on top.
- Duplicate detection compares bindings per scope, with notebook scope
  overlapping both others. At runtime the narrower scope wins.
