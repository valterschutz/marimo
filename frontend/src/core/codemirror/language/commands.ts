/* Copyright 2026 Marimo. All rights reserved. */

import type { EditorView } from "@codemirror/view";
import { maybeAddMarimoImport } from "@/core/cells/add-missing-import";
import type { CellActions } from "@/core/cells/cells";
import type { CellId } from "@/core/cells/ids";
import type { CellConfig } from "@/core/network/types";
import { languageAdapterState, switchLanguage } from "./extension";
import { LanguageAdapters } from "./LanguageAdapters";
import { MARKDOWN_INITIAL_HIDE_CODE } from "./languages/markdown";
import type { LanguageAdapterType } from "./types";
import { getEditorCodeAsPython } from "./utils";

/**
 * Get the current mode of the editor view.
 */
export function getCurrentLanguageAdapter(
  editorView: EditorView | null,
): LanguageAdapterType {
  if (!editorView) {
    return "python";
  }
  return editorView.state.field(languageAdapterState).type;
}

/**
 * Check if we can toggle to a given language
 */
function canToggleToLanguage(
  editorView: EditorView | null,
  language: LanguageAdapterType,
): boolean {
  // If there is no editor view or we are already in the language, return false
  if (!editorView || getCurrentLanguageAdapter(editorView) === language) {
    return false;
  }

  // If there is no code, we can always toggle to any language
  if (editorView.state.doc.toString().trim() === "") {
    return true;
  }

  return LanguageAdapters[language].isSupported(
    getEditorCodeAsPython(editorView),
  );
}

/**
 * Toggle to a given language
 */
export function toggleToLanguage(
  editorView: EditorView,
  language: LanguageAdapterType,
  opts: { force?: boolean } = {},
): LanguageAdapterType | false {
  // Check if the language can be toggled
  if (!opts.force && !canToggleToLanguage(editorView, language)) {
    return false;
  }

  switchLanguage(editorView, { language });

  return language;
}

type SaveCellConfig = (opts: {
  configs: Record<CellId, Partial<CellConfig>>;
}) => Promise<unknown>;

/**
 * Convert a cell to Markdown, adding the `mo` import if needed and hiding
 * the code the way the UI does when a cell is first turned into Markdown.
 */
export function convertCellToMarkdown({
  editorView,
  cellId,
  autoInstantiate,
  hideCode,
  createNewCell,
  updateCellConfig,
  saveCellConfig,
}: {
  editorView: EditorView;
  cellId: CellId;
  autoInstantiate: boolean;
  hideCode: boolean;
  createNewCell: CellActions["createNewCell"];
  updateCellConfig: CellActions["updateCellConfig"];
  saveCellConfig: SaveCellConfig;
}): void {
  maybeAddMarimoImport({ autoInstantiate, createNewCell });
  switchLanguage(editorView, { language: "markdown", keepCodeAsIs: false });
  if (!hideCode) {
    hideMarkdownCode({ cellId, updateCellConfig, saveCellConfig });
  }
}

/**
 * Hide the code of a cell that just became Markdown. The cell's own state is
 * updated first, so a slow or failed save cannot leave the code visible.
 */
export function hideMarkdownCode({
  cellId,
  updateCellConfig,
  saveCellConfig,
}: {
  cellId: CellId;
  updateCellConfig: CellActions["updateCellConfig"];
  saveCellConfig: SaveCellConfig;
}): void {
  if (!MARKDOWN_INITIAL_HIDE_CODE) {
    return;
  }
  const config = { hide_code: MARKDOWN_INITIAL_HIDE_CODE };
  updateCellConfig({ cellId, config });
  void saveCellConfig({ configs: { [cellId]: config } });
}
