# Security

## Reporting a vulnerability

Report in private. Use GitHub's [private vulnerability reporting](https://github.com/gabriel-aplok/bedrock-builder/security/advisories/new) on this repository. Do not open a public issue for a security problem.

Include the version, the command you ran, and the smallest config that reproduces it. You get a reply within a few days. Once a fix ships you are credited unless you ask otherwise.

## Supported versions

Fixes land on the latest minor release. Older minors get a fix only when the issue is high severity and the upgrade is not practical.

| Version | Supported |
| ------- | --------- |
| 0.3.x   | yes       |
| < 0.3   | no        |

## What is in scope

`bb` is a local build tool. It reads your project, writes build output, spawns a few local tools, and writes a release archive. In scope:

- A config value that makes `bb` read, write, or delete outside the project, the deploy target, and the configured extension directories.
- A path that escapes its root through `..`, a symlink, or a remapped extension path.
- Credentials or tokens printed to the console or written into a report.
- A dependency whose install script runs without an entry in `allowScripts`.
- Output injected into the terminal, a report, or a generated file from untrusted pack content.

## What is out of scope

- Anything that requires an already compromised machine or a modified copy of the package.
- Minecraft itself, the Bedrock server, or an installed add-on that does not behave.
- Running `bb` against a project you do not trust. Treat a config file like code.
- Missing hardening on a feature that does not exist, like a network service or a login.

## How the tool limits itself

`bb` sends no network requests on its own. Two exceptions: `bb init` runs `npm view` to suggest a dependency range, and `bb ext --install` runs `npm install --ignore-scripts` inside an extension folder.

Tools are spawned with argument arrays, never shell strings. On Windows, `execFile` gets a quoted command line because `npm.cmd` needs a shell, and the arguments are quoted before they reach it.

Dependency install scripts need an entry in `allowScripts` in `package.json`. The repo sets `strict-allow-scripts=true` in `.npmrc`, so an unreviewed script fails the install instead of running.

`bb clean` and `bb build --clean` refuse an `out` folder that is the project itself, a parent, or any folder holding the config, the packs, or the entry. Watch and deploy removals refuse a target that escapes its pack destination.

Delete targets and tool output are compared after resolving the parent directory, so a symlinked ancestor cannot redirect them.
