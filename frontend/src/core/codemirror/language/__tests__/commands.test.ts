/* Copyright 2026 Marimo. All rights reserved. */
// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cellId as makeCellId } from "@/__tests__/branded";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockRequestClient } from "@/__mocks__/requests";
import { OverridingHotkeyProvider } from "@/core/hotkeys/hotkeys";
import { requestClientAtom } from "@/core/network/requests";
import { store } from "@/core/state/jotai";
import { cellConfigExtension } from "../../config/extension";
import { convertCellToMarkdown } from "../commands";
import { adaptiveLanguageConfiguration } from "../extension";

const cellId = makeCellId("cell1");

let view: EditorView | null = null;

beforeEach(() => {
  store.set(requestClientAtom, MockRequestClient.create());
});

afterEach(() => {
  view?.destroy();
  view = null;
});

function createEditorView(content: string): EditorView {
  const config = {
    cellId,
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
      doc: content,
      extensions: [
        adaptiveLanguageConfiguration(config),
        cellConfigExtension({ ...config, diagnosticsConfig: {} }),
      ],
    }),
  });
  return view;
}

describe("convertCellToMarkdown", () => {
  it("hides the code without waiting for the cell config to save", () => {
    const updateCellConfig = vi.fn();

    convertCellToMarkdown({
      editorView: createEditorView(""),
      cellId,
      autoInstantiate: false,
      hideCode: false,
      createNewCell: vi.fn(),
      updateCellConfig,
      saveCellConfig: () => new Promise(() => undefined),
    });

    expect(updateCellConfig).toHaveBeenCalledWith({
      cellId,
      config: { hide_code: true },
    });
  });

  it("leaves the config alone when the code is already hidden", () => {
    const updateCellConfig = vi.fn();
    const saveCellConfig = vi.fn();

    convertCellToMarkdown({
      editorView: createEditorView(""),
      cellId,
      autoInstantiate: false,
      hideCode: true,
      createNewCell: vi.fn(),
      updateCellConfig,
      saveCellConfig,
    });

    expect(updateCellConfig).not.toHaveBeenCalled();
    expect(saveCellConfig).not.toHaveBeenCalled();
  });
});
