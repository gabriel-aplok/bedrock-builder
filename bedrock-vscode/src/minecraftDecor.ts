import * as vscode from "vscode";

import { SETTING_MINECRAFT_COLORS } from "./constants.js";
import { hoverCodeAt, minecraftNameOf, parseMinecraftLine } from "@aplok/bedrock-builder/editor";

// debounce keeps typing smooth on long lang files.
const DECOR_DEBOUNCE_MS = 200;

// files where § codes show in game: commands, json text, lang.
const DECOR_LANGUAGES = new Set(["mcfunction", "json", "jsonc", "plaintext", "bedrock-lang"]);

function enabled(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(SETTING_MINECRAFT_COLORS, true);
}

function targetable(document: vscode.TextDocument): boolean {
  if (!DECOR_LANGUAGES.has(document.languageId)) return false;
  if (document.languageId !== "plaintext") return true;
  return document.fileName.toLowerCase().endsWith(".lang");
}

function styleKey(color: string | undefined, bold: boolean, italic: boolean): string {
  return `${color ?? ""}|${bold ? "b" : ""}${italic ? "i" : ""}`;
}

export function registerMinecraftColors(context: vscode.ExtensionContext): void {
  const types = new Map<string, vscode.TextEditorDecorationType>();
  const obfuscated = vscode.window.createTextEditorDecorationType({
    opacity: "0.6",
    textDecoration: "underline wavy",
  });
  context.subscriptions.push(obfuscated);

  const typeFor = (
    color: string | undefined,
    bold: boolean,
    italic: boolean,
  ): vscode.TextEditorDecorationType => {
    const key = styleKey(color, bold, italic);
    const hit = types.get(key);
    if (hit) return hit;
    const options: vscode.DecorationRenderOptions = {};
    if (color !== undefined) options.color = color;
    if (bold) options.fontWeight = "bold";
    if (italic) options.fontStyle = "italic";
    const created = vscode.window.createTextEditorDecorationType(options);
    context.subscriptions.push(created);
    types.set(key, created);
    return created;
  };

  const clear = (editor: vscode.TextEditor): void => {
    for (const type of types.values()) editor.setDecorations(type, []);
    editor.setDecorations(obfuscated, []);
  };

  const paint = (editor: vscode.TextEditor): void => {
    // always clear first so toggles and edits never leave stale colors.
    clear(editor);
    if (!enabled() || !targetable(editor.document)) return;
    const buckets = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();
    const plain: vscode.Range[] = [];
    for (const { start, end } of editor.visibleRanges) {
      for (let line = start.line; line <= end.line; line++) {
        const text = editor.document.lineAt(line).text;
        for (const span of parseMinecraftLine(text)) {
          const type = typeFor(span.color, span.bold, span.italic);
          const bucket = buckets.get(type);
          if (bucket) bucket.push(new vscode.Range(line, span.start, line, span.end));
          else buckets.set(type, [new vscode.Range(line, span.start, line, span.end)]);
          if (span.obfuscated) plain.push(new vscode.Range(line, span.start, line, span.end));
        }
      }
    }
    for (const [type, ranges] of buckets) editor.setDecorations(type, ranges);
    editor.setDecorations(obfuscated, plain);
  };

  const paintVisible = (): void => {
    for (const editor of vscode.window.visibleTextEditors) paint(editor);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      paintVisible();
    }, DECOR_DEBOUNCE_MS);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(paintVisible),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (vscode.window.visibleTextEditors.some((editor) => editor.document === event.document)) {
        schedule();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTING_MINECRAFT_COLORS)) paintVisible();
    }),
    vscode.languages.registerHoverProvider(
      [
        { language: "mcfunction", scheme: "file" },
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
        { pattern: "**/*.lang", scheme: "file" },
      ],
      {
        provideHover(document, position) {
          const text = document.lineAt(position.line).text;
          const at = hoverCodeAt(text, position.character);
          if (!at) return undefined;
          const name = minecraftNameOf(at);
          if (!name) return undefined;
          return new vscode.Hover(`§${at.toLowerCase()} ${name}`);
        },
      },
    ),
  );
  paintVisible();
}
