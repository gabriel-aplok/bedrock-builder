import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const tsup = new URL("../node_modules/tsup/dist/cli-default.js", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(tsup), "--minify"], {
  env: { ...process.env, BB_PROD: "1" },
  stdio: "inherit",
});

function writeTypes() {
  const tsc = new URL("../node_modules/typescript/bin/tsc", import.meta.url);
  return new Promise((resolve) => {
    const types = spawn(
      process.execPath,
      [
        fileURLToPath(tsc),
        "--emitDeclarationOnly",
        "--declarationMap",
        "false",
        "--sourceMap",
        "false",
      ],
      { stdio: "inherit" },
    );
    types.on("error", () => resolve(1));
    types.on("close", (code) => resolve(code ?? 1));
  });
}

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("close", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  writeTypes().then((typesCode) => {
    if (typesCode !== 0) process.exitCode = typesCode;
  });
});
