import pc from "./colors.js";

let loud = false;
let machine = false;

export function setVerbose(value: boolean): void {
  loud = value;
}

export function isVerbose(): boolean {
  return loud;
}

export function setJson(value: boolean): void {
  machine = value;
}

export function isJson(): boolean {
  return machine;
}

const tag = "[bedrock-builder]";

function say(stream: NodeJS.WriteStream, line: string): void {
  stream.write(`${line}\n`);
}

export function printJson(payload: unknown): void {
  say(process.stdout, JSON.stringify(payload));
}

export const logger = {
  info(text: string): void {
    if (machine) return;
    say(process.stdout, `${pc.cyan(tag)} ${text}`);
  },
  success(text: string): void {
    if (machine) return;
    say(process.stdout, `${pc.green(tag)} ${text}`);
  },
  warn(text: string): void {
    if (machine) {
      say(process.stderr, JSON.stringify({ level: "warn", message: text }));
      return;
    }
    say(process.stderr, `${pc.yellow(tag)} warn: ${text}`);
  },
  error(text: string): void {
    if (machine) {
      say(process.stderr, JSON.stringify({ level: "error", message: text }));
      return;
    }
    say(process.stderr, `${pc.red(tag)} error: ${text}`);
  },
  debug(text: string): void {
    if (machine || !loud) return;
    say(process.stdout, `${pc.gray(`${tag} [debug]`)} ${pc.gray(text)}`);
  },
};
