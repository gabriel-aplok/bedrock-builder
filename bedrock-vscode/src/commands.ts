import * as vscode from "vscode";

import {
  build,
  brarchive,
  checkScriptImports,
  clean,
  create,
  deploy,
  doctor,
  harness,
  loadConfigLenient,
  pack,
  startDeployWatch,
  update,
  CREATE_TYPES,
  setJson,
  setVerbose,
  type CreateType,
  type DeploySession,
} from "@aplok/bedrock-builder";

import { output, runTask } from "./channel.js";
import { resolveProject } from "./config.js";
import {
  SETTING_BRARCHIVE_SERVER_DIR,
  SETTING_HARNESS_STRICT,
  SETTING_RUN_WORLD,
  SETTING_VERBOSE,
} from "./constants.js";
import { ensureSchemas } from "./schemas.js";
import { fetchRegistry, pickVersion } from "./schemaVersion.js";

function applyFlags(): void {
  const verbose = vscode.workspace.getConfiguration().get<boolean>(SETTING_VERBOSE, false);
  setVerbose(verbose);
  setJson(false);
}

function runWorld(): string {
  return vscode.workspace.getConfiguration().get<string>(SETTING_RUN_WORLD, "").trim();
}

function configDirOf(configPath: string): string {
  return configPath.split(/[\\/]/).slice(0, -1).join("/") || ".";
}

export function registerCommands(
  context: vscode.ExtensionContext,
  status: vscode.StatusBarItem,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("bedrock.build", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Build", async () => {
        await build(project.config, { clean: false });
      });
    }),
    vscode.commands.registerCommand("bedrock.run", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const world = runWorld();
      await runTask(world ? `Run (${world})` : "Run", async () => {
        await deploy(project.config, { watch: false, world: world || undefined });
      });
    }),
    vscode.commands.registerCommand("bedrock.update", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Update", async () => {
        const report = await update(project.config, {});
        if (report.updated.length === 0) output().appendLine("Everything is up to date.");
        else
          for (const row of report.updated)
            output().appendLine(`${row.name}: ${row.from} -> ${row.to}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.ship", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Ship", async () => {
        const report = await pack(project.config, {});
        vscode.window
          .showInformationMessage(`Shipped ${report.output}`)
          .then(undefined, () => undefined);
      });
    }),
    vscode.commands.registerCommand("bedrock.brarchive", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const serverDir = vscode.workspace
        .getConfiguration()
        .get<string>(SETTING_BRARCHIVE_SERVER_DIR, "")
        .trim();
      await runTask("Brarchive", async () => {
        const report = await brarchive(project.config, {
          ...(serverDir !== "" ? { serverDir } : {}),
        });
        vscode.window
          .showInformationMessage(`Compiled ${report.output}`)
          .then(undefined, () => undefined);
      });
    }),
    vscode.commands.registerCommand("bedrock.check", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Check", async () => {
        const report = await doctor(project.config, {});
        if (!report.ok)
          throw new Error(
            report.checks
              .filter((row) => !row.ok)
              .map((row) => row.name)
              .join(", "),
          );
      });
    }),
    vscode.commands.registerCommand("bedrock.clean", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Clean", async () => {
        await clean(project.config, {});
      });
    }),
    vscode.commands.registerCommand("bedrock.new", async () => {
      applyFlags();
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
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      await runTask("Scripts", async () => {
        const report = await checkScriptImports(
          project.config.entry,
          project.config.__configDir,
          `${project.config.packs.bp}/manifest.json`,
        );
        if (!report.ok) throw new Error(report.fix ?? report.detail);
      });
    }),
    vscode.commands.registerCommand("bedrock.harness", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      const strict = vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTING_HARNESS_STRICT, false);
      await runTask("Harness", async (log) => {
        const report = await harness(project.config, { build: true, strict });
        log(`checked ${report.files} files, ${report.jsonFiles} json`);
        for (const failure of report.failures) log(`finding: ${failure}`);
      });
    }),
    vscode.commands.registerCommand("bedrock.watch.start", async () => {
      applyFlags();
      const project = await resolveProject().catch(showResolveError);
      if (!project) return;
      if (watchSession) {
        void vscode.window.showInformationMessage("Bedrock watch is already running.");
        return;
      }
      const session = startDeployWatch(project.config, {});
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

// single active watch session. vscode runs commands on one host,
// so a module slot is enough without a map.
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

// sidecars the planners accept: item and block take recipe plus loot,
// entity takes equipment, loot, and spawn egg. kind picks,
// skip returns undefined.
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
