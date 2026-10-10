/* Copyright 2026 Marimo. All rights reserved. */

import { atom, useAtom, useAtomValue } from "jotai";
import {
  AlertTriangleIcon,
  BanIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { NativeSelect } from "@/components/ui/native-select";
import { hotkeysAtom, useResolvedMarimoConfig } from "@/core/config/config";
import type { UserConfig } from "@/core/config/config-schema";
import {
  type Binding,
  type HotkeyAction,
  type HotkeyGroup,
  formatScope,
  isShortcutScope,
  type ShortcutScope,
  validateBinding,
} from "@/core/hotkeys/hotkeys";
import { isPlatformMac } from "@/core/hotkeys/shortcuts";
import { useRequestClient } from "@/core/network/requests";
import { cn } from "@/utils/cn";
import { useDuplicateShortcuts } from "../../../hooks/useDuplicateShortcuts";
import { useHotkey } from "../../../hooks/useHotkey";
import { KeyboardHotkeys } from "../../shortcuts/renderShortcut";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "../../ui/dialog";
import { Tooltip } from "../../ui/tooltip";
import { DuplicateShortcutBanner } from "./duplicate-shortcut-banner";

export const keyboardShortcutsAtom = atom(false);

/** How long to wait for another key of a sequence before saving it. */
const SEQUENCE_COMMIT_DELAY = 1000;

const ScopeSelect: React.FC<{
  scopes: readonly ShortcutScope[];
  value: ShortcutScope;
  onChange: (scope: ShortcutScope) => void;
  className?: string;
}> = ({ scopes, value, onChange, className }) => (
  <NativeSelect
    aria-label="Shortcut scope"
    value={value}
    onChange={(e) => {
      if (isShortcutScope(e.target.value)) {
        onChange(e.target.value);
      }
    }}
    className={cn("mb-0", className)}
  >
    {scopes.map((scope) => (
      <option key={scope} value={scope}>
        {formatScope(scope)}
      </option>
    ))}
  </NativeSelect>
);

export const KeyboardShortcuts: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(keyboardShortcutsAtom);
  // The action a binding is being recorded for, the scope it will have, and
  // the chords pressed so far.
  const [recording, setRecording] = useState<{
    action: HotkeyAction;
    scope: ShortcutScope;
  } | null>(null);
  const [chords, setChords] = useState<string[]>([]);
  const [error, setError] = useState<{
    action: HotkeyAction;
    message: string;
  } | null>(null);
  const commitTimeout = useRef<number | undefined>(undefined);
  const [config, setConfig] = useResolvedMarimoConfig();
  const hotkeys = useAtomValue(hotkeysAtom);
  const { saveUserConfig } = useRequestClient();
  const { duplicates, hasDuplicate, getDuplicatesFor } = useDuplicateShortcuts(
    hotkeys,
    "Markdown",
  );

  useHotkey("global.showHelp", () => setIsOpen((v) => !v));

  useEffect(() => () => window.clearTimeout(commitTimeout.current), []);

  const saveConfigOptimistic = async (newConfig: Partial<UserConfig>) => {
    const prevConfig = { ...config };
    setConfig((prev) => ({ ...prev, ...newConfig }));
    await saveUserConfig({ config: newConfig }).catch((error) => {
      setConfig(prevConfig);
      throw error;
    });
  };

  const saveOverrides = async (
    update: (overrides: NonNullable<UserConfig["keymap"]["overrides"]>) => void,
  ) => {
    const overrides = { ...config.keymap.overrides };
    update(overrides);
    await saveConfigOptimistic({ keymap: { ...config.keymap, overrides } });
  };

  // Saves the action's bindings, refusing an invalid one with its reason.
  const saveBindings = async (action: HotkeyAction, bindings: Binding[]) => {
    const scopes = hotkeys.getScopes(action);
    for (const binding of bindings) {
      const reason = validateBinding(binding, scopes);
      if (reason) {
        setError({ action, message: reason });
        return;
      }
    }
    setError(null);
    const isDefault =
      JSON.stringify(bindings) ===
      JSON.stringify(hotkeys.getDefaultBindings(action));
    await saveOverrides((overrides) => {
      if (isDefault) {
        // oxlint-disable-next-line typescript/no-dynamic-delete
        delete overrides[action];
      } else {
        overrides[action] = bindings.length === 0 ? "" : bindings;
      }
    });
  };

  const stopRecording = () => {
    window.clearTimeout(commitTimeout.current);
    setRecording(null);
    setChords([]);
  };

  const addBinding = async (
    action: HotkeyAction,
    scope: ShortcutScope,
    keyChords: string[],
  ) => {
    stopRecording();
    await saveBindings(action, [
      ...hotkeys.getConfiguredBindings(action),
      { key: keyChords.join(" "), scope },
    ]);
  };

  const handleChord = (chord: string) => {
    if (!recording) {
      return;
    }
    const nextChords = [...chords, chord];
    window.clearTimeout(commitTimeout.current);
    // Cell command scope takes key sequences, so wait for another key.
    if (recording.scope === "cell-command") {
      setChords(nextChords);
      const { action, scope } = recording;
      commitTimeout.current = window.setTimeout(
        () => void addBinding(action, scope, nextChords),
        SEQUENCE_COMMIT_DELAY,
      );
      return;
    }
    void addBinding(recording.action, recording.scope, nextChords);
  };

  const resetShortcut = async (action: HotkeyAction) => {
    setError(null);
    await saveOverrides((overrides) => {
      // oxlint-disable-next-line typescript/no-dynamic-delete
      delete overrides[action];
    });
  };

  const disableShortcut = async (action: HotkeyAction) => {
    setError(null);
    await saveOverrides((overrides) => {
      overrides[action] = "";
    });
  };

  const handleResetAllShortcuts = async () => {
    if (
      !window.confirm(
        "Are you sure you want to reset all shortcuts to their default values?",
      )
    ) {
      return;
    }

    const newConfig: Partial<UserConfig> = {
      keymap: {
        ...config.keymap,
        overrides: {},
      },
    };

    stopRecording();
    setError(null);
    await saveConfigOptimistic(newConfig);
  };

  if (!isOpen) {
    return null;
  }

  const isOverridden = (action: HotkeyAction) =>
    (config.keymap.overrides ?? {})[action] !== undefined;

  const renderRecorder = (action: HotkeyAction, scope: ShortcutScope) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          value={chords.join(" ")}
          readOnly={true}
          placeholder="Press a key combination"
          onKeyDown={(e) => {
            e.preventDefault();
            const next: string[] = [];

            // Skip if the key is a modifier key
            if (
              e.key === "Meta" ||
              e.key === "Control" ||
              e.key === "Alt" ||
              e.key === "Shift"
            ) {
              return;
            }

            if (e.metaKey) {
              next.push(isPlatformMac() ? "Cmd" : "Meta");
            }
            if (e.ctrlKey) {
              next.push("Ctrl");
            }
            if (e.altKey) {
              next.push("Alt");
            }
            if (e.shiftKey) {
              next.push("Shift");
            }

            // We don't allow `-` to be a shortcut key, since it's used to
            // separate keys in the shortcut string
            if (e.key === "-") {
              return;
            }
            // If escape is pressed, without any modifier keys, cancel editing
            // We don't allow escape to be a shortcut key along, since it's used to
            // remove focus from many elements
            if (e.key === "Escape" && next.length === 0) {
              stopRecording();
              return;
            }

            // Single character keys are always lowercase (e.g. "a", "b", "c")
            // But we should preserve the original case for other keys (e.g. "Enter", "Escape")
            let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            // Handle edge cases
            if (e.key === " ") {
              key = "Space";
            }

            next.push(key);

            handleChord(next.join("-"));
          }}
          autoFocus={true}
          endAdornment={
            <Button
              variant="text"
              size="xs"
              className="mb-0"
              onClick={stopRecording}
            >
              <XIcon className="w-4 h-4" />
            </Button>
          }
        />
        <ScopeSelect
          scopes={hotkeys.getScopes(action)}
          value={scope}
          onChange={(nextScope) => {
            stopRecording();
            setRecording({ action, scope: nextScope });
          }}
        />
      </div>
      <span className="text-muted-foreground text-xs">
        {scope === "cell-command"
          ? "Press a key, or several for a sequence"
          : "Press a key combination with Ctrl, Alt or Cmd"}
      </span>
    </div>
  );

  const renderBinding = (
    action: HotkeyAction,
    binding: Binding,
    index: number,
    rejection?: string,
  ) => {
    const configured = hotkeys.getConfiguredBindings(action);
    const scopes = hotkeys.getScopes(action);
    return (
      <div
        key={`${index}-${binding.scope}-${binding.key}`}
        className="flex items-center justify-end gap-1"
      >
        {rejection ? (
          <Tooltip content={rejection} delayDuration={300}>
            <span className="line-through opacity-60">
              <KeyboardHotkeys shortcut={binding.key} />
            </span>
          </Tooltip>
        ) : (
          <KeyboardHotkeys shortcut={binding.key} />
        )}
        {hotkeys.isEditable(action) && scopes.length > 1 ? (
          <ScopeSelect
            scopes={scopes}
            value={binding.scope}
            onChange={(scope) =>
              saveBindings(
                action,
                configured.map((b, i) => (i === index ? { ...b, scope } : b)),
              )
            }
            className="text-xs"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatScope(binding.scope)}
          </span>
        )}
        {hotkeys.isEditable(action) && (
          <Tooltip content="Remove binding" delayDuration={300}>
            <XIcon
              className="cursor-pointer opacity-60 hover:opacity-100 text-muted-foreground w-3 h-3"
              onClick={() =>
                saveBindings(
                  action,
                  configured.filter((_, i) => i !== index),
                )
              }
            />
          </Tooltip>
        )}
      </div>
    );
  };

  const renderItem = (action: HotkeyAction) => {
    const hotkey = hotkeys.getHotkey(action);
    const bindings = hotkeys.getBindings(action);
    const isDuplicate = hasDuplicate(action);
    const duplicateActions = isDuplicate ? getDuplicatesFor(action) : [];

    return (
      <div key={action} className="flex flex-col gap-1">
        <div className="grid grid-cols-[auto_3fr_2fr] gap-2 items-center">
          {hotkeys.isEditable(action) ? (
            <div className="flex items-center gap-1.5">
              <Tooltip content="Add binding" delayDuration={300}>
                <PlusIcon
                  className="cursor-pointer opacity-60 hover:opacity-100 text-muted-foreground w-3 h-3"
                  onClick={() => {
                    stopRecording();
                    setError(null);
                    setRecording({
                      action,
                      scope: hotkeys.getScopes(action)[0],
                    });
                  }}
                />
              </Tooltip>
              {bindings.length > 0 && (
                <Tooltip content="Disable shortcut" delayDuration={300}>
                  <BanIcon
                    className="cursor-pointer opacity-60 hover:opacity-100 text-muted-foreground w-3 h-3"
                    onClick={() => disableShortcut(action)}
                  />
                </Tooltip>
              )}
              {isOverridden(action) && (
                <Tooltip content="Restore default shortcut" delayDuration={300}>
                  <RotateCcwIcon
                    className="cursor-pointer opacity-60 hover:opacity-100 text-muted-foreground w-3 h-3"
                    onClick={() => resetShortcut(action)}
                  />
                </Tooltip>
              )}
            </div>
          ) : (
            <div className="w-3 h-3" />
          )}
          <div className="flex flex-col gap-1">
            {hotkeys
              .getConfiguredBindings(action)
              .map((binding, index) =>
                renderBinding(
                  action,
                  binding,
                  index,
                  validateBinding(binding, hotkeys.getScopes(action)),
                ),
              )}
          </div>
          <div className="flex items-center gap-1">
            <span>{hotkey.name.toLowerCase()}</span>
            {isDuplicate && (
              <div className="group relative inline-flex">
                <AlertTriangleIcon className="w-3 h-3 text-(--yellow-11)" />
                <div className="invisible group-hover:visible absolute left-0 top-5 z-10 w-max max-w-xs rounded-md bg-(--yellow-2) border border-(--yellow-7) p-2 text-xs text-(--yellow-11) shadow-md">
                  Also used by:{" "}
                  {duplicateActions
                    .map((a) => hotkeys.getHotkey(a).name.toLowerCase())
                    .join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>
        {recording?.action === action &&
          renderRecorder(action, recording.scope)}
        {error?.action === action && (
          <span className="text-xs text-destructive">{error.message}</span>
        )}
      </div>
    );
  };

  const groups = hotkeys.getHotkeyGroups();
  const renderGroup = (group: HotkeyGroup, subHeader?: React.ReactNode) => {
    const items = groups[group];
    return (
      <div className="mb-[40px] gap-2 flex flex-col">
        <div>
          <h3 className="text-lg font-medium">{group}</h3>
          {subHeader}
        </div>
        {items.map(renderItem)}
      </div>
    );
  };

  const renderCommandGroup = (group: HotkeyGroup) =>
    renderGroup(
      group,
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        Press{" "}
        {config.keymap.preset === "vim" ? (
          <>
            <KeyboardHotkeys shortcut={isPlatformMac() ? "Cmd" : "Ctrl"} />
            <Kbd>Esc</Kbd>
          </>
        ) : (
          <Kbd>Esc</Kbd>
        )}{" "}
        in a cell to enter command mode
      </p>,
    );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      {/* Manually portal so we can adjust positioning: shortcuts modal is too large to offset from top for some screens. */}
      <DialogPortal className="sm:items-center sm:top-0">
        <DialogOverlay />
        <DialogContent
          usePortal={false}
          className="max-h-screen sm:max-h-[90vh] overflow-y-auto sm:max-w-[850px]"
        >
          <DialogHeader>
            <DialogTitle>Shortcuts</DialogTitle>
          </DialogHeader>
          <DuplicateShortcutBanner duplicates={duplicates} />
          <div className="flex flex-row gap-3">
            <div className="w-1/2">
              {renderGroup("Editing")}
              {renderGroup("Markdown")}
            </div>

            <div className="w-1/2">
              {renderGroup("Navigation")}
              {renderGroup("Running Cells")}
              {renderGroup("Creation and Ordering")}
              {renderCommandGroup("Command")}
              {renderGroup("Other")}
              <Button
                className="mt-4 hover:bg-destructive/10 border-destructive hover:border-destructive"
                variant="outline"
                size="xs"
                onClick={handleResetAllShortcuts}
                tabIndex={-1}
              >
                <span className="text-destructive">Reset all to default</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
