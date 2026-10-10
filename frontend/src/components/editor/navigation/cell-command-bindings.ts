/* Copyright 2026 Marimo. All rights reserved. */

import {
  getChords,
  type HotkeyAction,
  type HotkeyProvider,
} from "@/core/hotkeys/hotkeys";
import { parseShortcut } from "@/core/hotkeys/shortcuts";
import { handleVimKeybinding } from "./vim-bindings";

const MODIFIER_RE = /^(cmd|ctrl|alt|meta|mod|control|command|option)$/i;

/** Splits a chord such as `Shift-g` into its modifiers and base key. */
function splitChord(chord: string): { modifiers: string[]; base: string } {
  const separator = chord.length > 1 && chord.includes("+") ? "+" : "-";
  const parts = chord.split(separator);
  return { modifiers: parts.slice(0, -1), base: parts[parts.length - 1] };
}

/** Whether a key has a modifier other than Shift, such as `Ctrl-Shift-k`. */
function hasCommandModifier(key: string): boolean {
  return getChords(key).some((chord) =>
    splitChord(chord).modifiers.some((modifier) => MODIFIER_RE.test(modifier)),
  );
}

/**
 * Converts a key such as `Shift-g` or `g g` to the format
 * {@link handleVimKeybinding} matches: `shift+g`, `g g`.
 */
function toSequenceKey(key: string): string {
  return getChords(key)
    .map((chord) => {
      const { modifiers, base } = splitChord(chord);
      const pressed = base.toLowerCase() === "space" ? " " : base.toLowerCase();
      return modifiers.length > 0 ? `shift+${pressed}` : pressed;
    })
    .join(" ");
}

/**
 * Runs the action bound in cell command scope to the pressed key, or to the
 * key sequence it completes. Returns whether the key was handled, which
 * includes starting a sequence.
 *
 * Keys with a modifier other than Shift are matched as chords. Other keys,
 * and key sequences, are matched like Vim keys, so a key that starts a
 * sequence waits for the next one.
 */
export function handleCellCommandBindings(
  evt: KeyboardEvent,
  hotkeys: HotkeyProvider,
  runAction: (action: HotkeyAction) => boolean,
): boolean {
  const sequences: Record<string, () => boolean> = {};
  for (const action of hotkeys.iterate()) {
    for (const key of hotkeys.getKeys(action, "cell-command")) {
      if (hasCommandModifier(key)) {
        if (parseShortcut(key)(evt) && runAction(action)) {
          return true;
        }
        continue;
      }
      // The first action bound to a key keeps it.
      sequences[toSequenceKey(key)] ??= () => runAction(action);
    }
  }
  return handleVimKeybinding(evt, sequences);
}
