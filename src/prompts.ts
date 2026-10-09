// minimal interactive prompts, replaces the @clack/prompts
// dependency. same call shapes used across commands: intro,
// outro, note, cancel, log, spinner, text, confirm, select,
// multiselect, plus isCancel. non-tty input resolves with
// defaults instead of hanging.
import pc from "./colors.js";

const CANCEL = Symbol("cancel");

export function isCancel(value: unknown): boolean {
  return value === CANCEL;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function intro(title: string): void {
  out(pc.bold(title));
}

export function outro(message: string): void {
  out(message);
}

export function cancel(message: string): void {
  out(pc.red(message));
}

export function note(message: string, title: string): void {
  out(pc.bold(title));
  for (const line of message.split("\n")) out(`  ${line}`);
}

export const log = {
  message(text: string): void {
    out(text);
  },
  success(text: string): void {
    out(pc.green(text));
  },
  warn(text: string): void {
    out(pc.yellow(text));
  },
  error(text: string): void {
    out(pc.red(text));
  },
};

export interface Spinner {
  start(message: string): void;
  stop(message: string): void;
}

export function spinner(): Spinner {
  const frames = ["|", "/", "-", "\\"];
  let timer: NodeJS.Timeout | null = null;
  let index = 0;
  return {
    start(message: string): void {
      if (!(process.stdout.isTTY ?? false)) {
        out(message);
        return;
      }
      timer = setInterval(() => {
        process.stdout.write(`\r${pc.cyan(frames[index % frames.length]!)} ${message}`);
        index++;
      }, 80);
    },
    stop(message: string): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
        process.stdout.write("\r");
      }
      out(pc.green(message));
    },
  };
}

interface KeyReader {
  onKey: ((key: string) => void) | null;
  close: () => void;
}

function interactive(): boolean {
  return (process.stdin.isTTY ?? false) && (process.stdout.isTTY ?? false);
}

function readKeys(): KeyReader | null {
  const stdin = process.stdin;
  if (!interactive() || typeof stdin.setRawMode !== "function") return null;
  const reader: KeyReader = { onKey: null, close: () => {} };
  const data = (chunk: Buffer): void => {
    reader.onKey?.(chunk.toString("utf8"));
  };
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", data);
  reader.close = (): void => {
    stdin.removeListener("data", data);
    try {
      stdin.setRawMode(false);
    } catch {
      // already restored or unsupported, ignore.
    }
    stdin.pause();
  };
  return reader;
}

function hideCursor(): void {
  process.stdout.write("\u001b[?25l");
}

function showCursor(): void {
  process.stdout.write("\u001b[?25h");
}

// cursor must be on the last line of the block. clears the
// whole block, then the caller prints one summary line.
function clearBlock(lines: number): void {
  for (let i = 0; i < lines; i++) {
    process.stdout.write("\r\u001b[K");
    if (i < lines - 1) process.stdout.write("\u001b[A");
  }
  process.stdout.write("\r");
}

function summarize(message: string, result: string): void {
  out(`${pc.green("✓")} ${message} ${pc.gray("›")} ${result}`);
}

export interface TextOptions {
  message: string;
  placeholder?: string | undefined;
  defaultValue?: string | undefined;
  validate?: ((text: string) => string | undefined) | undefined;
}

export async function text(options: TextOptions): Promise<string | symbol> {
  if (!interactive()) return options.defaultValue ?? "";
  const reader = readKeys();
  if (reader === null) return options.defaultValue ?? "";
  return new Promise((resolve) => {
    let value = "";
    let error: string | null = null;
    const hint = options.placeholder ? pc.gray(` (${options.placeholder})`) : "";
    const render = (): void => {
      process.stdout.write(`\r\u001b[K? ${options.message}${hint}\n`);
      process.stdout.write(`\u001b[K› ${value}█`);
      if (error !== null) process.stdout.write(`\n\u001b[K${pc.red(error)}`);
      const up = error === null ? 1 : 2;
      if (up > 0) process.stdout.write(`\u001b[${up}A`);
      process.stdout.write(`\r\u001b[${2 + value.length}C`);
    };
    const finish = (result: string | symbol): void => {
      if (error !== null) process.stdout.write("\u001b[B");
      clearBlock(error !== null ? 3 : 2);
      showCursor();
      reader.close();
      if (result !== CANCEL && typeof result === "string") {
        summarize(options.message, result || options.placeholder || "—");
      }
      resolve(result);
    };
    hideCursor();
    render();
    reader.onKey = (key: string): void => {
      if (key === "\u0003" || key === "\u001b") {
        finish(CANCEL);
        return;
      }
      if (key === "\r" || key === "\n") {
        const problem = options.validate?.(value);
        if (typeof problem === "string" && problem !== "") {
          error = problem;
          render();
          return;
        }
        finish(value);
        return;
      }
      if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
        error = null;
        render();
        return;
      }
      if (key >= " " && !key.startsWith("\u001b")) {
        value += key;
        error = null;
        render();
      }
    };
  });
}

export interface ConfirmOptions {
  message: string;
  initialValue?: boolean | undefined;
}

export async function confirm(options: ConfirmOptions): Promise<boolean | symbol> {
  if (!interactive()) return options.initialValue ?? true;
  const reader = readKeys();
  if (reader === null) return options.initialValue ?? true;
  const initial = options.initialValue ?? true;
  return new Promise((resolve) => {
    let value = initial;
    const render = (): void => {
      const yes = value ? pc.green("yes") : "yes";
      const no = value ? "no" : pc.red("no");
      process.stdout.write(`\r\u001b[K? ${options.message} (${yes}/${no})`);
    };
    const finish = (result: boolean | symbol): void => {
      clearBlock(1);
      showCursor();
      reader.close();
      if (result !== CANCEL) summarize(options.message, result ? "yes" : "no");
      resolve(result);
    };
    hideCursor();
    render();
    reader.onKey = (key: string): void => {
      if (key === "\u0003" || key === "\u001b") {
        finish(CANCEL);
        return;
      }
      const lower = key.toLowerCase();
      if (lower === "y") {
        finish(true);
        return;
      }
      if (lower === "n") {
        finish(false);
        return;
      }
      if (key === "\r" || key === "\n" || key === " ") {
        finish(value);
        return;
      }
      if (key === "\u001b[D" || key === "\u001b[C") {
        value = !value;
        render();
      }
    };
  });
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string | undefined;
}

export interface SelectOptions {
  message: string;
  options: SelectOption[];
  initialValue?: string | undefined;
}

export async function select(options: SelectOptions): Promise<string | symbol> {
  const fallback = options.initialValue ?? options.options[0]?.value ?? "";
  if (!interactive()) return fallback;
  const reader = readKeys();
  if (reader === null) return fallback;
  return new Promise((resolve) => {
    let index = Math.max(
      0,
      options.options.findIndex((item) => item.value === options.initialValue),
    );
    const render = (): void => {
      let block = `? ${options.message}\n`;
      options.options.forEach((item, at) => {
        const cursor = at === index ? pc.cyan("›") : " ";
        const label = at === index ? pc.cyan(item.label) : item.label;
        const hint = item.hint ? pc.gray(` (${item.hint})`) : "";
        block += `${cursor} ${label}${hint}\n`;
      });
      process.stdout.write(`\r\u001b[K${block}`);
      process.stdout.write(`\u001b[${options.options.length + 1}A`);
    };
    const finish = (result: string | symbol): void => {
      process.stdout.write(`\u001b[${options.options.length}B`);
      clearBlock(options.options.length + 1);
      showCursor();
      reader.close();
      if (result !== CANCEL && typeof result === "string") {
        const label = options.options.find((item) => item.value === result)?.label ?? result;
        summarize(options.message, label);
      }
      resolve(result);
    };
    hideCursor();
    render();
    reader.onKey = (key: string): void => {
      if (key === "\u0003" || key === "\u001b") {
        finish(CANCEL);
        return;
      }
      if (key === "\r" || key === "\n" || key === " ") {
        finish(options.options[index]?.value ?? fallback);
        return;
      }
      if (key === "\u001b[A" || key === "k") {
        index = (index - 1 + options.options.length) % options.options.length;
        render();
        return;
      }
      if (key === "\u001b[B" || key === "j") {
        index = (index + 1) % options.options.length;
        render();
      }
    };
  });
}

export interface MultiselectOptions {
  message: string;
  options: SelectOption[];
  required?: boolean | undefined;
}

export async function multiselect(options: MultiselectOptions): Promise<string[] | symbol> {
  if (!interactive()) return [];
  const reader = readKeys();
  if (reader === null) return [];
  return new Promise((resolve) => {
    let index = 0;
    const picked = new Set<string>();
    let warned = false;
    const render = (): void => {
      let block = `? ${options.message} (space to toggle, enter to confirm)\n`;
      options.options.forEach((item, at) => {
        const cursor = at === index ? pc.cyan("›") : " ";
        const box = picked.has(item.value) ? pc.green("■") : "□";
        const hint = item.hint ? pc.gray(` (${item.hint})`) : "";
        block += `${cursor} ${box} ${item.label}${hint}\n`;
      });
      if (warned) block += pc.yellow("pick at least one option\n");
      const lines = block.split("\n").length - 1;
      process.stdout.write(`\r\u001b[K${block}`);
      process.stdout.write(`\u001b[${lines}A`);
    };
    const finish = (result: string[] | symbol, lines: number): void => {
      process.stdout.write(`\u001b[${lines - 1}B`);
      clearBlock(lines);
      showCursor();
      reader.close();
      if (result !== CANCEL) {
        const labels = (result as string[]).map(
          (value) => options.options.find((item) => item.value === value)?.label ?? value,
        );
        summarize(options.message, labels.length > 0 ? labels.join(", ") : "none");
      }
      resolve(result);
    };
    hideCursor();
    render();
    reader.onKey = (key: string): void => {
      const lines = options.options.length + 1 + (warned ? 1 : 0);
      if (key === "\u0003" || key === "\u001b") {
        finish(CANCEL, lines);
        return;
      }
      if (key === "\r" || key === "\n") {
        if ((options.required ?? true) && picked.size === 0) {
          warned = true;
          render();
          return;
        }
        finish([...picked], lines);
        return;
      }
      if (key === " ") {
        const current = options.options[index];
        if (current) {
          if (picked.has(current.value)) picked.delete(current.value);
          else picked.add(current.value);
        }
        warned = false;
        render();
        return;
      }
      if (key === "\u001b[A" || key === "k") {
        index = (index - 1 + options.options.length) % options.options.length;
        render();
        return;
      }
      if (key === "\u001b[B" || key === "j") {
        index = (index + 1) % options.options.length;
        render();
      }
    };
  });
}
