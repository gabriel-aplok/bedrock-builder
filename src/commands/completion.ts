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

function bashScript(): string {
  const commands = COMMANDS.join(" ");
  const cases = COMMANDS.map((command) => {
    const flags = flagsFor(command).join(" ");
    let extra = "";
    if (command === "new") extra = ` ${CREATE_TYPES.join(" ")}`;
    if (command === "completion") extra = " bash zsh powershell";
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

function zshScript(): string {
  const commands = COMMANDS.map((command) => `      "${command}"`).join("\n");
  const cases = COMMANDS.map((command) => {
    const flags = flagsFor(command)
      .map((flag) => `        "${flag}"`)
      .join("\n");
    let extra = "";
    if (command === "new") {
      extra = `\n${CREATE_TYPES.map((type) => `        "${type}"`).join("\n")}`;
    }
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

function powershellScript(): string {
  const commands = COMMANDS.map((command) => `    '${command}'`).join(",\n");
  const flags = Object.fromEntries(COMMANDS.map((command) => [command, flagsFor(command)]));
  const newTypes = CREATE_TYPES.map((type) => `      '${type}'`).join(",\n");
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
  $out = $values | Where-Object { $_ -like "$wordToComplete*" }
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

export function completion(shell: CompletionShell): string {
  if (shell === "zsh") return zshScript();
  if (shell === "powershell") return powershellScript();
  return bashScript();
}
