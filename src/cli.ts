import type { CliArgs, Command, CreateFlags } from "./cli/args.js";
import { COMMANDS } from "./cli/args.js";
import { dispatch } from "./cli/dispatch.js";
import { HELP, showHelp } from "./cli/help.js";
import { parseArgs } from "./cli/parse.js";
import { logger, setJson, setVerbose } from "./logger.js";

export { COMMANDS, dispatch, HELP, parseArgs, showHelp };
export type { CliArgs, Command, CreateFlags };

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.verbose) setVerbose(true);
  if (args.json) setJson(true);
  return dispatch(args);
}

const launched =
  typeof process.argv[1] === "string" &&
  import.meta.url ===
    `file://${process.argv[1].replace(/\\/g, "/")}`.replace("file:///", "file:///");

if (
  launched ||
  process.argv[1]?.endsWith("cli.js") ||
  process.argv[1]?.endsWith("bedrock-builder")
) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exit(1);
    });
}
