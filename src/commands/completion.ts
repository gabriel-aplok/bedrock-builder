import { COMMANDS, type Command } from "../cli/args.js";
import { TOGGLE_FLAGS, VALUE_FLAGS } from "../cli/parse.js";
import { CREATE_TYPES } from "../generate/core/types.js";

export type CompletionShell = "bash" | "zsh" | "powershell";

export class CompletionError extends Error {
  readonly exitCode = 14;
  constructor(message: string) {
    super(message);
    this.name = "CompletionError";
  }
}

export function parseCompletionShell(raw: string | undefined): CompletionShell {
  const shell = (raw ?? "bash").trim().toLowerCase();
  if (shell === "bash" || shell === "zsh" || shell === "powershell") return shell;
  throw new CompletionError(`Unknown shell "${raw}". Pick bash, zsh, or powershell.`);
}

function flagsFor(command: Command): string[] {
  const out = new Set<string>(["--json", "--config", "--verbose", "--help", "--version"]);
  for (const [flag, commands] of Object.entries(VALUE_FLAGS)) {
    if (commands.includes(command)) out.add(flag);
  }
  for (const [flag, commands] of Object.entries(TOGGLE_FLAGS)) {
    if (commands.includes(command)) out.add(flag);
  }
  return [...out].sort();
}

// escape a value for a double-quoted shell word, keeping spaces escaped.
function shellWord(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "\\ ")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function psWord(value: string): string {
  return value.replace(/'/g, "''");
}

function bashScript(worlds: string[]): string {
  const commands = COMMANDS.join(" ");
  const runWorlds = worlds.map(shellWord).join(" ");
  const cases = COMMANDS.map((command) => {
    const flags = flagsFor(command).join(" ");
    let extra = "";
    if (command === "new") extra = ` ${CREATE_TYPES.join(" ")}`;
    if (command === "completion") extra = " bash zsh powershell";
    if (command === "run" && runWorlds !== "") {
      return `      ${command}) prev="\${COMP_WORDS[COMP_CWORD-1]}"\n        if [[ "$prev" == "--world" ]]; then COMPREPLY=($(compgen -W "${runWorlds}" -- "$cur")); else COMPREPLY=($(compgen -W "${flags}" -- "$cur")); fi ;;`;
    }
    return `      ${command}) COMPREPLY=($(compgen -W "${flags}${extra}" -- "$cur")) ;;`;
  }).join("\n");
  return `# bb completion for bash. source it or drop it in /etc/bash_completion.d/bb.
_bb_complete() {
  local cur cmd
  cur="\${COMP_WORDS[COMP_CWORD]}"
  cmd="\${COMP_WORDS[1]}"
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${commands}" -- "\$cur"))
    return 0
  fi
  case "\$cmd" in
${cases}
    *) COMPREPLY=() ;;
  esac
  return 0
}
complete -F _bb_complete bb bedrock-builder
`;
}

function zshScript(worlds: string[]): string {
  const commands = COMMANDS.map((command) => `      "${command}"`).join("\n");
  const runWorlds = worlds.map((world) => `        "${shellWord(world)}"`).join("\n");
  const cases = COMMANDS.map((command) => {
    const flags = flagsFor(command)
      .map((flag) => `        "${flag}"`)
      .join("\n");
    let extra = "";
    if (command === "new") {
      extra = `\n${CREATE_TYPES.map((type) => `        "${type}"`).join("\n")}`;
    }
    if (command === "run" && runWorlds !== "") extra = `\n${runWorlds}`;
    if (command === "completion") extra = '\n        "bash"\n        "zsh"\n        "powershell"';
    return `    ${command})\n      local -a values=(\n${flags}${extra}\n      )\n      _describe -t values "values" values ;;`;
  }).join("\n");
  return `#compdef bb bedrock-builder
# bb completion for zsh. drop it in a fpath directory as _bb.
_bb() {
  local -a commands=(
${commands}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands "command" commands
    return 0
  fi
  case "$words[2]" in
${cases}
    *) ;;
  esac
}
_bb "$@"
`;
}

function powershellScript(worlds: string[]): string {
  const commands = COMMANDS.map((command) => `    '${command}'`).join(",\n");
  const flags = Object.fromEntries(COMMANDS.map((command) => [command, flagsFor(command)]));
  const newTypes = CREATE_TYPES.map((type) => `      '${type}'`).join(",\n");
  const runWorlds = worlds.map((world) => `      '${psWord(world)}'`).join(",\n");
  const worldsBlock =
    runWorlds !== ""
      ? `  if ($command -eq 'run' -and $words.Count -ge 3 -and $words[$words.Count - 2] -eq '--world') {
    $worldValues = @(
${runWorlds}
    )
    return $worldValues | Where-Object { $_ -like "$wordToComplete*" }
  }
`
      : "";
  return `# bb completion for powershell. dot-source it from $PROFILE.
Register-ArgumentCompleter -Native -CommandName @('bb', 'bedrock-builder') -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = $commandAst.ToString() -split '\\s+'
  $commands = @(
${commands}
  )
  if ($words.Count -le 2) {
    return $commands | Where-Object { $_ -like "$wordToComplete*" }
  }
  $flags = @{
${COMMANDS.map((command) => `    '${command}' = @(${flags[command]!.map((flag) => `'${flag}'`).join(", ")})`).join("\n")}
  }
  $command = $words[1]
  $values = $flags[$command]
  if ($null -eq $values) { return }
${worldsBlock}  $out = $values | Where-Object { $_ -like "$wordToComplete*" }
  if ($command -eq 'new') {
    $types = @(
${newTypes}
    )
    $out += $types | Where-Object { $_ -like "$wordToComplete*" }
  }
  if ($command -eq 'completion') {
    $out += @('bash', 'zsh', 'powershell') | Where-Object { $_ -like "$wordToComplete*" }
  }
  return $out
}
`;
}

// embed worlds as --world candidates; empty when the game install is missing.
export function completion(shell: CompletionShell, worlds: string[] = []): string {
  if (shell === "zsh") return zshScript(worlds);
  if (shell === "powershell") return powershellScript(worlds);
  return bashScript(worlds);
}
