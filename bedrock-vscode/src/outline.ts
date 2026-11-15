import * as vscode from "vscode";

export interface JsonNode {
  // key span for properties, value span for roots and items.
  start: number;
  end: number;
  // object or array end offset, -1 for scalars.
  close: number;
  key?: string | undefined;
  // scalar text for string, number, and literal leaves.
  value?: string | undefined;
  children: JsonNode[];
}

// deep nesting bails; vscode shows its own outline. real pack files stay shallow.
const MAX_JSON_DEPTH = 100;

// minimal json scanner for outline. null when malformed.
export function scanJson(text: string): JsonNode[] | null {
  let at = 0;

  function skipSpace(): void {
    for (;;) {
      while (at < text.length && " \t\r\n".includes(text[at]!)) at++;
      if (text.startsWith("//", at)) {
        const end = text.indexOf("\n", at + 2);
        at = end === -1 ? text.length : end + 1;
        continue;
      }
      if (text.startsWith("/*", at)) {
        const end = text.indexOf("*/", at + 2);
        at = end === -1 ? text.length : end + 2;
        continue;
      }
      return;
    }
  }

  function scanString(): { value: string; start: number; end: number } | null {
    if (text[at] !== '"') return null;
    const start = at;
    at++;
    let value = "";
    while (at < text.length) {
      const char = text[at]!;
      if (char === "\\") {
        value += text[at + 1] ?? "";
        at += 2;
        continue;
      }
      if (char === '"') {
        at++;
        return { value, start, end: at };
      }
      value += char;
      at++;
    }
    return null;
  }

  function scanScalar(into: JsonNode): boolean {
    skipSpace();
    if (text[at] === '"') {
      const hit = scanString();
      if (!hit) return false;
      into.value = hit.value;
      into.end = hit.end;
      return true;
    }
    const hit = /^(true|false|null|-?\d[^,\]}]*)/.exec(text.slice(at));
    if (!hit) return false;
    into.value = hit[1]!.trim();
    into.end = at + hit[1]!.length;
    at += hit[1]!.length;
    return true;
  }

  function scanValue(into: JsonNode, depth: number): boolean {
    if (depth > MAX_JSON_DEPTH) return false;
    skipSpace();
    into.start = at;
    if (text[at] === "{") return scanObjectInto(into.children, into, depth + 1);
    if (text[at] === "[") {
      at++;
      into.close = -1;
      skipSpace();
      if (text[at] === "]") {
        at++;
        into.end = at;
        into.close = at;
        return true;
      }
      for (;;) {
        skipSpace();
        const item: JsonNode = { start: at, end: at, close: -1, children: [] };
        if (text[at] === "]") {
          at++;
          into.end = at;
          into.close = at;
          return true;
        }
        if (!scanValue(item, depth + 1)) return false;
        into.children.push(item);
        skipSpace();
        if (text[at] === ",") {
          at++;
          skipSpace();
          if (text[at] === "]") {
            at++;
            into.end = at;
            into.close = at;
            return true;
          }
          continue;
        }
        if (text[at] === "]") {
          at++;
          into.end = at;
          into.close = at;
          return true;
        }
        return false;
      }
    }
    return scanScalar(into);
  }

  function scanObjectInto(children: JsonNode[], into?: JsonNode, depth: number = 0): boolean {
    if (depth > MAX_JSON_DEPTH) return false;
    at++;
    skipSpace();
    if (text[at] === "}") {
      at++;
      if (into) {
        into.end = at;
        into.close = at;
      }
      return true;
    }
    for (;;) {
      skipSpace();
      const key = scanString();
      if (!key) return false;
      skipSpace();
      if (text[at] !== ":") return false;
      at++;
      const node: JsonNode = {
        start: key.start,
        end: key.end,
        close: -1,
        key: key.value,
        children: [],
      };
      if (!scanValue(node, depth + 1)) return false;
      children.push(node);
      skipSpace();
      if (text[at] === ",") {
        at++;
        skipSpace();
        if (text[at] === "}") {
          at++;
          if (into) {
            into.end = at;
            into.close = at;
          }
          return true;
        }
        continue;
      }
      if (text[at] === "}") {
        at++;
        if (into) {
          into.end = at;
          into.close = at;
        }
        return true;
      }
      return false;
    }
  }

  skipSpace();
  if (text[at] !== "{") return text.trim() === "" ? [] : null;
  const root: JsonNode = { start: at, end: at + 1, close: -1, children: [] };
  if (!scanObjectInto(root.children, root)) return null;
  skipSpace();
  if (at !== text.length) return null;
  return [root];
}

export function byKey(node: JsonNode): Map<string, JsonNode> {
  const out = new Map<string, JsonNode>();
  for (const child of node.children) {
    if (child.key !== undefined && !out.has(child.key)) out.set(child.key, child);
  }
  return out;
}

function rangeOf(start: number, end: number, document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

function toSymbol(
  node: JsonNode,
  name: string,
  detail: string,
  kind: vscode.SymbolKind,
  document: vscode.TextDocument,
  children: vscode.DocumentSymbol[] = [],
): vscode.DocumentSymbol {
  const end = node.close !== -1 ? node.close : node.end;
  const symbol = new vscode.DocumentSymbol(
    name,
    detail,
    kind,
    rangeOf(node.start, end, document),
    rangeOf(node.start, node.end, document),
  );
  symbol.children = children;
  return symbol;
}

function propsOf(
  node: JsonNode | undefined,
  document: vscode.TextDocument,
): vscode.DocumentSymbol[] {
  if (!node) return [];
  return [...byKey(node).entries()].map(([name, child]) =>
    toSymbol(child, name, "", vscode.SymbolKind.Property, document),
  );
}

function identifierOf(body: JsonNode): string {
  const desc = byKey(body).get("description");
  const id = desc ? byKey(desc).get("identifier") : undefined;
  return id?.value ?? "";
}

function entitySymbols(node: JsonNode, document: vscode.TextDocument): vscode.DocumentSymbol[] {
  const id = identifierOf(node);
  const fields = byKey(node);
  return [
    toSymbol(
      node,
      id === "" ? "minecraft:entity" : `minecraft:entity ${id}`,
      "",
      vscode.SymbolKind.Class,
      document,
      [
        ...propsOf(fields.get("components"), document),
        ...propsOf(fields.get("component_groups"), document),
        ...propsOf(fields.get("events"), document),
      ],
    ),
  ];
}

function controllersSymbols(
  node: JsonNode,
  document: vscode.TextDocument,
): vscode.DocumentSymbol[] {
  return [...byKey(node).entries()].map(([name, controller]) =>
    toSymbol(controller, name, "controller", vscode.SymbolKind.Class, document, [
      ...propsOf(byKey(controller).get("states"), document),
    ]),
  );
}

function animationsSymbols(node: JsonNode, document: vscode.TextDocument): vscode.DocumentSymbol[] {
  return [...byKey(node).entries()].map(([name, animation]) =>
    toSymbol(animation, name, "animation", vscode.SymbolKind.Class, document, [
      ...propsOf(byKey(animation).get("bones"), document),
    ]),
  );
}

// item id inside a recipe slot: result, ingredient, or input shapes.
function slotId(node: JsonNode): string {
  const fields = byKey(node);
  return fields.get("item")?.value ?? fields.get("name")?.value ?? node.value ?? "";
}

// recipe contents: result first, then key symbols, ingredients,
// and furnace input. unknown shapes fall back to top props.
function recipeSymbols(
  key: string,
  node: JsonNode,
  document: vscode.TextDocument,
): vscode.DocumentSymbol[] {
  const fields = byKey(node);
  const children: vscode.DocumentSymbol[] = [];
  const result = fields.get("result") ?? fields.get("output");
  if (result) {
    const id = slotId(result);
    children.push(
      toSymbol(
        result,
        id === "" ? "result" : `result ${id}`,
        "",
        vscode.SymbolKind.String,
        document,
      ),
    );
  }
  const keyNode = fields.get("key");
  if (keyNode) {
    for (const [symbol, ref] of byKey(keyNode)) {
      const id = slotId(ref);
      children.push(
        toSymbol(
          ref,
          id === "" ? symbol : `${symbol} ${id}`,
          "ingredient",
          vscode.SymbolKind.String,
          document,
        ),
      );
    }
  }
  const ingredients = fields.get("ingredients")?.children ?? [];
  ingredients.forEach((entry, index) => {
    const id = slotId(entry);
    children.push(
      toSymbol(
        entry,
        id === "" ? `ingredient ${index + 1}` : `ingredient ${id}`,
        "",
        vscode.SymbolKind.String,
        document,
      ),
    );
  });
  const input = fields.get("input");
  if (input) {
    const id = slotId(input);
    children.push(
      toSymbol(input, id === "" ? "input" : `input ${id}`, "", vscode.SymbolKind.String, document),
    );
  }
  if (children.length === 0) {
    children.push(...propsOf(node, document).slice(0, 30));
  }
  const id = identifierOf(node);
  return [
    toSymbol(
      node,
      id === "" ? key : `${key} ${id}`,
      "",
      vscode.SymbolKind.Class,
      document,
      children,
    ),
  ];
}

// loot table pools: one symbol per pool, entries underneath; names fall back to the type.
function poolsSymbols(pools: JsonNode, document: vscode.TextDocument): vscode.DocumentSymbol[] {
  const items = pools.children.map((pool, index) => {
    const entries = byKey(pool).get("entries")?.children ?? [];
    const entrySymbols = entries.map((entry, entryIndex) => {
      const fields = byKey(entry);
      const name =
        fields.get("name")?.value ?? fields.get("type")?.value ?? `entry ${entryIndex + 1}`;
      const detail = fields.get("name")?.value ? (fields.get("type")?.value ?? "") : "";
      return toSymbol(entry, name, detail, vscode.SymbolKind.String, document);
    });
    const count = entries.length;
    return toSymbol(
      pool,
      `pool ${index + 1}`,
      `${count} ${count === 1 ? "entry" : "entries"}`,
      vscode.SymbolKind.Object,
      document,
      entrySymbols,
    );
  });
  const count = pools.children.length;
  return [toSymbol(pools, `pools (${count})`, "", vscode.SymbolKind.Array, document, items)];
}

// outline roots per file shape; unknown files fall back to top-level keys for breadcrumbs.
export function outlineSymbols(
  roots: JsonNode[],
  document: vscode.TextDocument,
): vscode.DocumentSymbol[] {
  const out: vscode.DocumentSymbol[] = [];
  for (const root of roots) {
    for (const [key, node] of byKey(root)) {
      if (key === "minecraft:entity") {
        out.push(...entitySymbols(node, document));
      } else if (key === "pools") {
        out.push(...poolsSymbols(node, document));
      } else if (key === "animation_controllers") {
        out.push(...controllersSymbols(node, document));
      } else if (key === "animations") {
        out.push(...animationsSymbols(node, document));
      } else if (key.startsWith("minecraft:recipe")) {
        out.push(...recipeSymbols(key, node, document));
      } else if (key.startsWith("minecraft:")) {
        const id = identifierOf(node);
        out.push(
          toSymbol(
            node,
            id === "" ? key : `${key} ${id}`,
            "",
            vscode.SymbolKind.Class,
            document,
            propsOf(node, document).slice(0, 30),
          ),
        );
      } else {
        out.push(toSymbol(node, key, "", vscode.SymbolKind.Property, document));
      }
    }
  }
  return out;
}

export function registerOutline(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        provideDocumentSymbols(document) {
          const roots = scanJson(document.getText());
          if (!roots) return undefined;
          return outlineSymbols(roots, document);
        },
      },
    ),
  );
}
