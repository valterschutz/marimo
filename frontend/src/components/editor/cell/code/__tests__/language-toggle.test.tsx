/* Copyright 2026 Marimo. All rights reserved. */
// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import { cellId } from "@/__tests__/branded";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cellConfigExtension } from "@/core/codemirror/config/extension";
import { adaptiveLanguageConfiguration } from "@/core/codemirror/language/extension";
import { OverridingHotkeyProvider } from "@/core/hotkeys/hotkeys";
import { LanguageToggles } from "../language-toggle";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createEditorView(): EditorView {
  const config = {
    cellId: cellId("cell1"),
    completionConfig: {
      copilot: false,
      activate_on_typing: true,
      signature_hint_on_typing: false,
      codeium_api_key: null,
    },
    lspConfig: {},
    hotkeys: new OverridingHotkeyProvider({}),
    placeholderType: "marimo-import",
  } as const;
  view = new EditorView({
    state: EditorState.create({
      extensions: [
        adaptiveLanguageConfiguration(config),
        cellConfigExtension({ ...config, diagnosticsConfig: {} }),
      ],
    }),
  });
  return view;
}

describe("LanguageToggles", () => {
  it.each(["SQL", "Markdown"] as const)(
    "reports the language it toggled to when viewing as %s",
    (displayName) => {
      const onAfterToggle = vi.fn();
      render(
        <TooltipProvider>
          <LanguageToggles
            editorView={createEditorView()}
            code=""
            currentLanguageAdapter="python"
            onAfterToggle={onAfterToggle}
          />
        </TooltipProvider>,
      );

      fireEvent.click(
        screen.getByRole("button", { name: `View as ${displayName}` }),
      );

      expect(onAfterToggle).toHaveBeenCalledWith(
        displayName === "SQL" ? "sql" : "markdown",
      );
    },
  );
});
