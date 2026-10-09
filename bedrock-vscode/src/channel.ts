import * as vscode from "vscode";

import { OUTPUT_NAME } from "./constants.js";

let channel: vscode.OutputChannel | undefined;

export function output(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel(OUTPUT_NAME);
  return channel;
}

// run a builder task with start and done lines. errors go to the
// channel plus an error toast, and resolve to undefined.
export async function runTask<T>(
  title: string,
  fn: (log: (line: string) => void) => Promise<T>,
): Promise<T | undefined> {
  const log = (line: string): void => {
    output().appendLine(line);
  };
  output().appendLine(`${title}...`);
  try {
    const result = await fn(log);
    output().appendLine(`${title}: done`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    output().appendLine(`${title} failed: ${message}`);
    output().show(true);
    const first = message.split("\n")[0] ?? message;
    void vscode.window.showErrorMessage(`${title} failed: ${first}`);
    return undefined;
  }
}
