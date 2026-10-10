/* Copyright 2026 Marimo. All rights reserved. */

import { useMemo } from "react";
import type {
  HotkeyAction,
  HotkeyGroup,
  HotkeyProvider,
  ShortcutScope,
} from "@/core/hotkeys/hotkeys";

export interface DuplicateGroup {
  key: string;
  actions: { action: HotkeyAction; name: string }[];
}

export interface DuplicateShortcutsResult {
  /** All groups of duplicate shortcuts */
  duplicates: DuplicateGroup[];
  /** Check if a specific action has duplicate shortcuts */
  hasDuplicate: (action: HotkeyAction) => boolean;
  /** Get all actions that share the same shortcut as the given action */
  getDuplicatesFor: (action: HotkeyAction) => HotkeyAction[];
}

/**
 * Normalizes a keyboard shortcut key for comparison.
 * - Converts to lowercase
 * - Replaces + with - for consistent comparison
 * - Trims whitespace
 */
export function normalizeShortcutKey(key: string): string {
  return key.toLowerCase().replaceAll("+", "-").trim();
}

/**
 * Whether two bindings in these scopes can fire at the same time. Notebook
 * scope is active with editor focus and in cell command mode, so it overlaps
 * both.
 */
function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === b || a === "notebook" || b === "notebook";
}

/**
 * Detects duplicate keyboard shortcuts in a hotkey provider: bindings of
 * different actions with the same key, in scopes that overlap.
 * Returns information about which shortcuts are duplicated and provides utilities
 * to check if specific actions have duplicates.
 *
 * This is a pure function that can be tested independently of React.
 *
 * @param hotkeys - The hotkey provider to check for duplicates
 * @param ignoreGroup - Optional group to exclude from duplicate detection (e.g., "Markdown")
 */
export function findDuplicateShortcuts(
  hotkeys: HotkeyProvider,
  ignoreGroup?: HotkeyGroup,
): DuplicateShortcutsResult {
  // Get all groups to check for ignored actions
  const groups = hotkeys.getHotkeyGroups();
  const ignoredActions = ignoreGroup
    ? new Set(groups[ignoreGroup] || [])
    : new Set();

  // Group bindings by their key
  const keyMap = new Map<
    string,
    { action: HotkeyAction; scope: ShortcutScope }[]
  >();

  for (const action of hotkeys.iterate()) {
    // Skip actions in ignored groups
    if (ignoredActions.has(action)) {
      continue;
    }

    for (const { key, scope } of hotkeys.getBindings(action)) {
      // Skip empty keys (not set)
      if (key.trim() === "") {
        continue;
      }
      const normalizedKey = normalizeShortcutKey(key);
      const bindings = keyMap.get(normalizedKey) ?? [];
      bindings.push({ action, scope });
      keyMap.set(normalizedKey, bindings);
    }
  }

  // Each action's conflicting actions, and the keys with conflicts
  const conflicts = new Map<HotkeyAction, Set<HotkeyAction>>();
  const duplicates: DuplicateGroup[] = [];

  for (const [key, bindings] of keyMap.entries()) {
    const conflicting = new Set<HotkeyAction>();
    for (const a of bindings) {
      for (const b of bindings) {
        if (a.action !== b.action && scopesOverlap(a.scope, b.scope)) {
          conflicting.add(a.action);
          const others = conflicts.get(a.action) ?? new Set();
          others.add(b.action);
          conflicts.set(a.action, others);
        }
      }
    }
    if (conflicting.size > 0) {
      duplicates.push({
        key,
        actions: [...conflicting].map((action) => ({
          action,
          name: hotkeys.getHotkey(action).name,
        })),
      });
    }
  }

  return {
    duplicates,
    hasDuplicate: (action) => conflicts.has(action),
    getDuplicatesFor: (action) => [...(conflicts.get(action) ?? [])],
  };
}

/**
 * Hook to detect duplicate keyboard shortcuts.
 * Returns information about which shortcuts are duplicated and provides utilities
 * to check if specific actions have duplicates.
 *
 * @param hotkeys - The hotkey provider to check for duplicates
 * @param ignoreGroup - Optional group to exclude from duplicate detection (e.g., "Markdown")
 */
export function useDuplicateShortcuts(
  hotkeys: HotkeyProvider,
  ignoreGroup?: HotkeyGroup,
): DuplicateShortcutsResult {
  return useMemo(
    () => findDuplicateShortcuts(hotkeys, ignoreGroup),
    [hotkeys, ignoreGroup],
  );
}
