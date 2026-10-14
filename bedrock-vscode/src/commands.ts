import * as vscode from "vscode";

import type { Builder } from "./builder.js";
import { resolveBuilder } from "./builder.js";
import {
  checkScriptImports,
  clean,
  create,
  CREATE_TYPES,
  diff,
  doctor,
  importProject,
  init,
  loadConfigLenient,
  manifest,
  report,
  update,
  version,
  type CreateType,
} from "@aplok/bedrock-builder/editor";
import type { DeploySession } from "@aplok/bedrock-builder";

import { output, runTask } from "./channel.js";
import { refreshCompletions } from "./complete.js";
import { resolveProject } from "./config.js";
import {
  SETTING_BRARCHIVE_SERVER_DIR,
  SETTING_HARNESS_STRICT,
  SETTING_RUN_WORLD,
  SETTING_VERBOSE,
} from "./constants.js";
import { ensureSchemas } from "./schemas.js";
import { fetchRegistry, pickVersion } from "./schemaVersion.js";

// flag the project builder logger; only pipeline commands need it.
function applyFlags(bb: Builder): void {
  const verbose = vscode.workspace.getConfiguration().get<boolean>(SETTING_VERBOSE, false);
  bb.setVerbose(verbose);
  bb.setJson(false);
}

function runWorld(): string {
  return vscode.workspace.getConfiguration().get<string>(SETTING_RUN_WORLD, "").trim();
}

function configDirOf(configPath: string): string {
  return configPath.split(/[\\/]/).slice(0, -1).join("/") || ".";
}

const SEMVER = /^\d+\.\d+\.\d+$/;

export function registerCommands(
  context: vscode.ExtensionContext,
  status: vscode.StatusBarItem,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("bedrock.build", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      await runTask("Build", async () => {
        await project.bb.build(project.config, { clean: false });
      });
    }),
    vscode.commands.registerCommand("bedrock.run", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      const world = runWorld();
      await runTask(world ? `Run (${world})` : "Run", async () => {
        await project.bb.deploy(project.config, { watch: false, world: world || undefined });
      });
    }),
    vscode.commands.registerCommand("bedrock.world.select", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      const names = await project.bb.listWorlds(project.config);
      if (names.length === 0) {
        void vscode.window.showInformationMessage(
          "Bedrock: no worlds found under the deploy target. Runs go to the dev packs.",
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        [
          { label: "Dev packs", description: "clear the world target" },
          ...names.map((name) => ({ label: name })),
        ],
        { placeHolder: "Run target world" },
      );
      if (!picked) return;
      await vscode.workspace
        .getConfiguration(undefined, project.folder.uri)
        .update(
          SETTING_RUN_WORLD,
          picked.label === "Dev packs" ? "" : picked.label,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
    }),
    vscode.commands.registerCommand("bedrock.update", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Update", async () => {
        const result = await update(project.config, {});
        if (result.updated.length === 0) output().appendLine("Everything is up to date.");
        else
          for (const row of result.updated)
            output().appendLine(`${row.name}: ${row.from} -> ${row.to}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.ship", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      await runTask("Ship", async () => {
        const result = await project.bb.pack(project.config, {});
        vscode.window
          .showInformationMessage(`Shipped ${result.output}`)
          .then(undefined, () => undefined);
      });
    }),
    vscode.commands.registerCommand("bedrock.brarchive", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      const serverDir = vscode.workspace
        .getConfiguration()
        .get<string>(SETTING_BRARCHIVE_SERVER_DIR, "")
        .trim();
      await runTask("Brarchive", async () => {
        const result = await project.bb.brarchive(project.config, {
          ...(serverDir !== "" ? { serverDir } : {}),
        });
        vscode.window
          .showInformationMessage(`Compiled ${result.output}`)
          .then(undefined, () => undefined);
      });
    }),
    vscode.commands.registerCommand("bedrock.serverDir.select", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use as server folder",
      });
      if (!picked?.[0]) return;
      await vscode.workspace
        .getConfiguration(undefined, project.folder.uri)
        .update(
          SETTING_BRARCHIVE_SERVER_DIR,
          picked[0].fsPath,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
    }),
    vscode.commands.registerCommand("bedrock.check", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Check", async () => {
        const result = await doctor(project.config, {});
        if (!result.ok)
          throw new Error(
            result.checks
              .filter((row) => !row.ok)
              .map((row) => row.name)
              .join(", "),
          );
      });
    }),
    vscode.commands.registerCommand("bedrock.clean", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Clean", async () => {
        await clean(project.config, {});
      });
    }),
    vscode.commands.registerCommand("bedrock.new", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const type = await vscode.window.showQuickPick([...CREATE_TYPES], {
        placeHolder: "Feature type",
      });
      if (!type) return;
      const name = await vscode.window.showInputBox({
        prompt: `Name for ${type}`,
        validateInput: (text) => (text.trim() === "" ? "Name is required." : undefined),
      });
      if (!name) return;
      const sidecars = await pickSidecars(type as CreateType);
      if (sidecars === undefined) return;
      await runTask(`New ${type} ${name}`, async () => {
        await create(project.config, {
          type: type as CreateType,
          name: name.trim(),
          ...sidecars,
          yes: true,
        });
      });
    }),
    vscode.commands.registerCommand("bedrock.diff", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Diff", async (log) => {
        const result = await diff(project.config);
        for (const row of result.files) log(`${row.status} ${row.path}`);
        log(`added ${result.added}, modified ${result.modified}, deleted ${result.deleted}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.manifest", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const target = await vscode.window.showInputBox({
        prompt: "Version for both manifests. Empty keeps the current versions.",
        placeHolder: "x.y.z",
        validateInput: (text) =>
          text.trim() === "" || SEMVER.test(text.trim()) ? undefined : "Use x.y.z.",
      });
      if (target === undefined) return;
      await runTask("Manifest", async (log) => {
        const result = await manifest({
          dir: project.config.__configDir,
          version: target.trim() || undefined,
        });
        for (const row of result.targets) log(`${row.kind} ${row.path}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.version", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const next = await vscode.window.showInputBox({
        prompt: `New version. Current is ${project.config.version}.`,
        placeHolder: "x.y.z",
        validateInput: (text) => (SEMVER.test(text.trim()) ? undefined : "Use x.y.z."),
      });
      if (!next) return;
      await runTask("Version", async (log) => {
        const result = await version(next.trim(), { dir: project.configPath });
        log(`version ${result.version}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.publish", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      const bump = await vscode.window.showQuickPick(["None", "patch", "minor", "major"], {
        placeHolder: "Bump the version first?",
      });
      if (bump === undefined) return;
      const git = await vscode.window.showQuickPick(["Ship only", "Tag", "Tag and push"], {
        placeHolder: "Git step after ship?",
      });
      if (git === undefined) return;
      await runTask("Publish", async () => {
        const result = await project.bb.publish(project.config, {
          ...(bump !== "None" ? { bump } : {}),
          tag: git !== "Ship only",
          push: git === "Tag and push",
        });
        vscode.window
          .showInformationMessage(`Published ${result.output}`)
          .then(undefined, () => undefined);
      });
    }),
    vscode.commands.registerCommand("bedrock.import", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        showError(new Error("Open a folder first."));
        return;
      }
      await runTask("Import", async (log) => {
        const result = await importProject(folder.uri.fsPath, {});
        for (const file of result.files) log(`wrote ${file}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.init", async () => {
      const name = await vscode.window.showInputBox({
        prompt: "Project name",
        validateInput: (text) => (text.trim() === "" ? "Name is required." : undefined),
      });
      if (!name) return;
      const parent = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Create project here",
      });
      if (!parent?.[0]) return;
      const dir = vscode.Uri.joinPath(parent[0], name.trim()).fsPath;
      const result = await runTask("Init", async () => init(name.trim(), { dir, install: false }));
      if (!result?.ok) return;
      const open = await vscode.window.showInformationMessage(`Created ${dir}`, "Open folder");
      if (open === "Open folder") {
        await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(dir), false);
      }
    }),
    vscode.commands.registerCommand("bedrock.completions.refresh", async () => {
      await runTask("Completions", async (log) => {
        log(`indexed ${await refreshCompletions()} values`);
      });
    }),
    vscode.commands.registerCommand("bedrock.schema.select", async () => {
      const registry = await fetchRegistry().catch((err: unknown) => {
        showError(err);
        return undefined;
      });
      if (!registry) return;
      const folder = vscode.workspace.workspaceFolders?.[0];
      const current = folder
        ? vscode.workspace
            .getConfiguration(undefined, folder.uri)
            .get<string>("bedrock.schema.version", "latest")
        : "latest";
      const picked = await pickVersion(registry, current);
      if (!picked || !folder) return;
      await vscode.workspace
        .getConfiguration(undefined, folder.uri)
        .update("bedrock.schema.version", picked, vscode.ConfigurationTarget.WorkspaceFolder);
      await ensureSchemas(context, status, "version selected");
    }),
    vscode.commands.registerCommand("bedrock.schema.refresh", async () => {
      await ensureSchemas(context, status, "refresh requested");
    }),
    vscode.commands.registerCommand("bedrock.scripts.check", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Scripts", async () => {
        const result = await checkScriptImports(
          project.config.entry,
          project.config.__configDir,
          `${project.config.packs.bp}/manifest.json`,
        );
        if (!result.ok) throw new Error(result.fix ?? result.detail);
      });
    }),
    vscode.commands.registerCommand("bedrock.harness", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      const strict = vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTING_HARNESS_STRICT, false);
      await runTask("Harness", async (log) => {
        const result = await project.bb.harness(project.config, { build: true, strict });
        log(`checked ${result.files} files, ${result.jsonFiles} json`);
        for (const failure of result.failures) log(`finding: ${failure}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.report", async () => {
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Report", async (log) => {
        const result = await report(project.config, {});
        log(`${result.files} files, ${result.jsonFiles} json, ${result.bytes} bytes`);
        for (const row of result.duplicates) log(`duplicate ${row.id}`);
        for (const path of result.invalid) log(`invalid json ${path}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.watch.start", async () => {
      const project = await resolveBuilder().catch(showResolveError);
      if (!project) return;
      applyFlags(project.bb);
      if (watchSession) {
        void vscode.window.showInformationMessage("Bedrock watch is already running.");
        return;
      }
      const world = runWorld();
      const session = project.bb.startDeployWatch(project.config, {
        ...(world !== "" ? { world } : {}),
      });
      watchSession = session;
      output().appendLine("Watch deploy started. Run Bedrock: Stop watch deploy to end it.");
      output().show(true);
      try {
        await session.done;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output().appendLine(`Watch deploy ended: ${message}`);
      } finally {
        if (watchSession === session) watchSession = undefined;
      }
    }),
    vscode.commands.registerCommand("bedrock.watch.stop", async () => {
      if (!watchSession) {
        void vscode.window.showInformationMessage("Bedrock watch is not running.");
        return;
      }
      watchSession.stop();
      output().appendLine("Watch deploy stopping...");
    }),
  );
}

// single watch session; one host means a module slot, no map.
let watchSession: DeploySession | undefined;

async function showResolveError(err: unknown): Promise<never> {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Config")) {
    const lenient = await tryLenient();
    if (lenient) throw new Error(`${message} (config dir: ${lenient})`);
  }
  void vscode.window.showErrorMessage(`Bedrock: ${message}`);
  throw err instanceof Error ? err : new Error(message);
}

async function tryLenient(): Promise<string | undefined> {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.[0]) return undefined;
    const config = await loadConfigLenient(undefined);
    return configDirOf(config.__configDir);
  } catch {
    return undefined;
  }
}

function showError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`Bedrock: ${message}`);
}

// sidecars per kind: item and block take recipe plus loot;
// entity takes equipment, loot, and spawn egg.
async function pickSidecars(
  type: CreateType,
): Promise<{ recipe?: string; loot?: string; equipment?: string; spawnEgg?: boolean } | undefined> {
  const out: {
    recipe?: string;
    loot?: string;
    equipment?: string;
    spawnEgg?: boolean;
  } = {};
  if (type === "item" || type === "block") {
    const recipe = await vscode.window.showQuickPick(["None", "shapeless", "shaped", "furnace"], {
      placeHolder: "Crafting recipe?",
    });
    if (recipe === undefined) return undefined;
    if (recipe !== "None") out.recipe = recipe;
    const loot = await vscode.window.showQuickPick(["None", "block", "chest"], {
      placeHolder: "Loot table?",
    });
    if (loot === undefined) return undefined;
    if (loot !== "None") out.loot = loot;
  }
  if (type === "entity") {
    const equipment = await vscode.window.showQuickPick(["None", "table"], {
      placeHolder: "Equipment table?",
    });
    if (equipment === undefined) return undefined;
    if (equipment !== "None") out.equipment = equipment;
    const loot = await vscode.window.showQuickPick(["None", "entity"], {
      placeHolder: "Loot table?",
    });
    if (loot === undefined) return undefined;
    if (loot !== "None") out.loot = loot;
    const egg = await vscode.window.showQuickPick(["No", "Yes"], {
      placeHolder: "Spawn egg?",
    });
    if (egg === undefined) return undefined;
    if (egg === "Yes") out.spawnEgg = true;
  }
  return out;
}
