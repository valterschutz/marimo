# Helix preset: no per-cell panels, selections painted on the text

## Problem Statement

With the `helix` keymap preset, every cell carries the engine's statusline ("NOR", "SEL", "INS") plus its command panel below the editor. Together they are twice as tall as an editor line and they repeat under every cell, so a notebook with twenty cells has twenty bars. The information is redundant: the cursor shape already shows insert mode (bar) against editor normal and select mode (block).

Helix is select-first: you build a selection with motions and then act on it, so seeing the selection is the whole point. In a cell editor the selection is drawn as a band behind the text, which any theme with an opaque active-line background hides for every selection on the cursor's line, and that is where most Helix selections live (`w`, `e`, `miw`, a single `x`). What remains visible is only the block cursor. Helix proper also inverts the selected text to the background colour, which a band behind the text can never do.

## Solution

The Helix preset hides the engine's statusline and collapses its command panel to nothing while idle, expanding it only while a `:` or `/` prompt is open. The block cursor takes the theme's caret colour instead of the engine's hard-coded grey. Every selection range is additionally marked on the text itself with a stable class that carries no styling of its own, so stock marimo looks unchanged while custom CSS can paint selections Helix-style: opaque background, inverted foreground.

The maintainer's catppuccin CSS (in dotfiles, outside this repo) then sets a blue block cursor and mauve selections with base-coloured text, and drops the opaque active-line rule and the obsolete statusline rule.

## User Stories

### Panels

1. As a Helix user, I want no statusline under any cell, so that a notebook is not covered in mode bars.
2. As a Helix user, I want no empty command panel under any cell while no prompt is open, so that a cell is exactly as tall as its editor.
3. As a Helix user, I want the command panel to appear when I press `:`, so that I can see what I type for `:w`, `:q` and `:wq`.
4. As a Helix user, I want the command panel to appear when I press `/`, so that search prompts are visible.
5. As a Helix user, I want the command panel to disappear again when the prompt closes, by Enter or Escape, so that the cell returns to its editor-only height.
6. As a Helix user, I want a pending prefix such as `g`, `m`, space or `[` not to expand the panel, so that goto motions do not jump the layout for a single keystroke.
7. As a Helix user, I want the statusline to stay in the DOM even though hidden, so that mode detection, the personal remaps, the AI-trigger suppression and Escape handling keep working.
8. As a Helix user, I want the mode to be readable from cursor shape alone, bar in insert and block otherwise, so that no indicator is needed.
9. As a theme author, I want the engine's panel class names unchanged, so that existing CSS targeting them is not broken.

### Cursor

10. As a Helix user, I want the block cursor to use the theme's caret colour by default, so that it fits both light and dark themes without a hard-coded grey.
11. As a theme author, I want to override the block cursor colour and the colour of the character under it from custom CSS, so that my terminal Helix theme carries over.
12. As a Helix user, I want the insert-mode bar caret unchanged, so that insert mode still looks like insert mode.

### Selections

13. As a Helix user, I want every selection range marked on the text itself, so that a selection stays visible on the active line regardless of the theme's active-line background.
14. As a Helix user, I want the mark to cover every range of a multi-cursor selection, so that `C` and `s` selections are all visible.
15. As a Helix user, I want the mark applied in editor normal, select and insert mode and for pointer selections alike, so that there is one consistent selection appearance.
16. As a Helix user, I want an empty range to produce no mark, so that a collapsed insert-mode cursor is not decorated.
17. As a Helix user, I want the mark to follow every selection change immediately, so that motions are reflected without lag.
18. As a theme author, I want the mark to have a stable class and no default styling, so that I can set an opaque background and invert the foreground, and stock marimo users see no change.
19. As a theme author, I want syntax-coloured tokens inside a selection to be overridable to the base colour, so that selected text inverts fully as in Helix.
20. As a marimo user on the default or vim preset, I want nothing about my selections or editor height to change, so that the Helix preset stays self-contained.

### Personal CSS (dotfiles, tracked outside this repo)

21. As the maintainer, I want the block cursor blue (`#89b4fa`) with base foreground, so that it matches my terminal Helix.
22. As the maintainer, I want selections mauve (`#cba6f7`) with base foreground, so that selected text reads as it does in Helix.
23. As the maintainer, I want the opaque active-line rule removed, so that marimo's translucent default applies and nothing hides selections.
24. As the maintainer, I want the ineffective statusline-hiding rule removed, so that the CSS does not carry dead rules now that the preset hides the statusline.

## Implementation Decisions

- **Statusline hidden by the preset.** The Helix extension bundle gains a theme rule that hides the engine's statusline panel. The element remains mounted because the preset's single mode reader parses the mode label from it. Specificity must beat the engine's own generated theme rule, which outranks a plain single-class selector.
- **Command panel collapsed while idle.** The engine keeps the command panel mounted with a minimum height and shows its prompt by toggling the visibility of an inner input container; it exposes no "prompt open" state. The preset collapses the panel to zero height and reserves no slot, and expands it only while an input is present inside the panel. The pending-prefix text the engine writes into the panel does not expand it. Whether this is a pure CSS rule or a small view plugin toggling an attribute on the editor is an implementation choice; the observable behaviour is the contract.
- **Block cursor colour.** The preset overrides the engine's grey cursor mark background with the theme's caret colour. The engine's `cm-hx-cursor` class is kept, and custom CSS may override both background and foreground. Because syntax tokens are inner spans with their own colour, inverting the character requires styling the mark's descendants too; the preset leaves that to custom CSS.
- **Selection mark.** The preset adds a decoration that marks every non-empty selection range with a stable class (proposed `cm-hx-selection`) in the content layer, next to the engine's own head cursor mark. It applies in every editor mode and to every range, recomputed on selection and document changes. It has no default styling. CodeMirror's existing selection layer keeps drawing its band underneath and is left alone.
- **Mode cue.** No visual cue for editor select mode versus normal mode is added. No statusline information (register, count, line:column) is relocated.
- **Scope split.** Behaviour above lives in the preset and is upstream quality. Colours live in the maintainer's catppuccin CSS in dotfiles: blue block cursor with base foreground, mauve selection with base foreground, rosewater bar caret unchanged, active-line rule and statusline rule removed.
- **Glossary.** CONTEXT.md distinguishes cell command mode, cell select mode, editor normal mode, editor select mode, editor insert mode, statusline and command panel. Use those terms in code comments and tests.

## Testing Decisions

A good test mounts the preset in a real editor, drives it with keyboard events, and asserts on what a user or a stylesheet can observe: computed styles of the engine's panels, the presence and extent of marked text in the content DOM, the cursor's computed colour. Tests do not reach into the engine's private fields or assert on generated class names beyond the stable ones this spec defines.

One existing seam: the Helix extension factory mounted in an `EditorView` under jsdom. Prior art is the existing Helix extension tests, which already mount the extension, press keys via CodeMirror's scope handlers, and assert on computed styles (the AI-trigger suppression test checks `display: none` through `getComputedStyle`). Cases:

- statusline computed display is none after mount and after switching modes
- command panel has zero height while idle, non-zero while a `:` prompt is open, zero again after Escape, and zero while a `g` prefix is pending
- the statusline element is still present and the mode reader still reports normal and insert correctly
- the cursor mark's computed background equals the caret colour in a theme that sets one
- after `x` the marked spans in the content DOM cover exactly the selected line; after `v j j` they cover the multi-line range; after `i` with a collapsed cursor there are none; with two ranges both are marked; a pointer-style selection dispatched directly is marked
- the mark has no computed background or colour of its own under the stock light and dark themes

Keymap bundle tests gain one assertion that the `helix` bundle includes the selection mark, and the default and vim bundles do not.

Not automated: a headless-browser smoke check with the maintainer's catppuccin CSS confirms the panels are gone, the prompt expands on `:` and collapses on Escape, the cursor is blue with inverted text, and a single-`x` selection is mauve with inverted text on the active line. Rebuild the frontend first; the static bundle was found stale during investigation.

## Out of Scope

- Any visual cue for editor select mode.
- Relocating statusline information (register, count, line:column) anywhere else.
- Changing the stock selection colours or active-line colours for the default and vim presets.
- Removing CodeMirror's selection layer or the engine's own `drawSelection`.
- Changing the catppuccin CSS inside this repo; it lives in dotfiles.
- Configurable colours through the marimo config.

## Further Notes

- Decided through a grilling session on 2026-10-04. Investigation found no marimo rendering bug: with the stock themes, multi-line and single-line selections render identically to the default preset. The invisible selections came from the opaque active-line rule in the maintainer's custom CSS, and the still-visible statusline from a rule the engine's theme outranks.
- The engine's statusline is the only source that distinguishes editor normal from editor select mode; the scroll-element class only distinguishes insert from non-insert. Keep the statusline in the DOM.
- Both the engine's cursor mark and the new selection mark are mark decorations, so syntax token spans nest inside them. Custom CSS inverting the foreground must use a descendant selector.
- Repo guidelines apply: run `make check` before committing, no autonomous PRs, comments explain why.
