# marimo notebook editor

The reactive notebook's frontend, where a user moves between cells and edits
the code inside them. This glossary exists because the Helix keymap preset
introduces modal editing at two levels, and the same words are used for both.

## Language

### Focus

**Cell focus**:
Focus on a cell itself rather than on anything inside it. A cell with cell
focus is in cell command mode.
_Avoid_: cell selected (selection is separate from focus)

**Editor focus**:
Focus inside a cell's editor. The cell counts as focused, but keys go to the
editor.
_Avoid_: edit mode

### Modes

**Cell command mode**:
The state in which a cell is focused but no editor inside it is. Keys act on
whole cells.
_Avoid_: command mode, normal mode (when referring to cells)

**Cell selection**:
The contiguous run of cells, within one column, that cell-level actions
(move, delete, copy) act on as a unit. A single focused cell with nothing
selected acts as a one-cell selection.
_Avoid_: multi-select, range (unqualified)

**Cell select mode**:
A cell command mode state in which movement keys extend the multi-cell
selection instead of moving focus.
_Avoid_: select mode, visual mode, extend mode

**Editor normal mode**:
The Helix engine's mode inside a cell editor in which keys are motions and
actions rather than text.
_Avoid_: normal mode (unqualified)

**Editor select mode**:
The Helix engine's mode inside a cell editor in which motions extend the
selection instead of replacing it.
_Avoid_: select mode (unqualified), visual mode

**Editor insert mode**:
The Helix engine's mode inside a cell editor in which keys type text.
_Avoid_: insert mode (unqualified)

### Helix engine surfaces

**Statusline**:
The engine's panel under an editor showing the mode label, active register
and cursor position.
_Avoid_: mode indicator, status bar

**Command panel**:
The engine's panel under an editor that hosts the `:` command prompt and
the `/` search prompt.
_Avoid_: command line, prompt panel

**Block cursor**:
The engine's one-character cursor mark in editor normal and select mode. It
is drawn only while the editor has focus.
_Avoid_: caret (that is the insert-mode bar)

**Selection mark**:
The class on the text of every non-empty selection range, which custom CSS
paints Helix-style. Like the block cursor, it is drawn only while the editor
has focus.
_Avoid_: selection band, highlight

**Linewise selection**:
A selection whose every range runs from a line's start to the start of the
line after it, or to the document's end for the last line, as built by `x`.
_Avoid_: line selection (ambiguous with a selection that merely touches a
line)

**Linewise register**:
A register whose content was yanked from a linewise selection. `p` and `P`
paste it as a new line rather than inserting in place.
_Avoid_: line register

### Editing

**Completion menu**:
The list of completion candidates that opens under the cursor while typing
in an editor. Only one item in it is selected at a time.
_Avoid_: autocomplete list, popup

### Cells

**Hidden code**:
A cell's code when its `hide_code` flag is set: only the output is shown.
Only editor focus, or a user selection inside the editor (such as a find
match), temporarily reveals it; cell focus alone does not. Every way of
creating a Markdown cell sets the flag, so Markdown cells start with hidden
code. A Markdown cell with empty source is never hidden, since it has no
output to show in its place.
_Avoid_: collapsed, folded
