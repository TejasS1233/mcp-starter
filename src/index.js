#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import process from "node:process";
import { getAuthStatus, interactiveAuthLogin } from "./auth.js";
import { parseFlags, printApply, printHelp, printPresetCatalog, printValidate, runWizard } from "./cli.js";
import { createServerFromPreset, ESSENTIAL_SERVERS, PRESET_CATALOG, TARGET_SCOPE_PATHS } from "./constants.js";
import { evaluateSafety, guardAction } from "./safety.js";
import { importTargetsIntoStack } from "./importer.js";
import { initStackFile, loadStackFile, updateStack } from "./stack.js";
import { startSupervisor } from "./supervisor.js";
import { applyStack } from "./targets.js";
import { parseCsv, parseEnvCsv } from "./utils.js";

function requireValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function askToBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["y", "yes", "1", "true"].includes(normalized);
}

async function handleServerCommand(command, positional, flags) {
  const serverId = positional[1];
  requireValue(serverId, `Missing server id for ${command}`);

  await updateStack(async (stack) => {
    if (command === "add") {
      const pkg = requireValue(flags.package, "Missing --package for add");
      const env = flags.env ? parseEnvCsv(String(flags.env)) : {};
      stack.servers[serverId] = {
        enabled: true,
        package: pkg,
        args: flags.args ? parseCsv(String(flags.args)) : [],
        env,
        safety: {
          level: String(flags.level || "medium"),
          requireApproval: true,
          riskyActions: flags.risky ? parseCsv(String(flags.risky)) : []
        }
      };
      console.log(`Added server ${serverId}`);
      return;
    }

    const existing = stack.servers[serverId];
    if (!existing) {
      throw new Error(`Unknown server: ${serverId}`);
    }

    if (command === "remove") {
      delete stack.servers[serverId];
      console.log(`Removed server ${serverId}`);
      return;
    }
    if (command === "enable") {
      existing.enabled = true;
      console.log(`Enabled server ${serverId}`);
      return;
    }
    if (command === "disable") {
      existing.enabled = false;
      console.log(`Disabled server ${serverId}`);
      return;
    }
  });
}

async function handleTargetCommand(positional, flags) {
  const sub = positional[1];
  const targetId = positional[2];
  requireValue(sub, "Missing target subcommand");
  requireValue(targetId, "Missing target id");

  await updateStack(async (stack) => {
    if (sub === "add") {
      const format = requireValue(flags.format, "Missing --format for target add");
      const filePath = requireValue(flags.path, "Missing --path for target add");
      stack.targets[targetId] = {
        enabled: true,
        format: String(format),
        path: String(filePath)
      };
      console.log(`Added target ${targetId}`);
      return;
    }

    const existing = stack.targets[targetId];
    if (!existing) {
      throw new Error(`Unknown target: ${targetId}`);
    }

    if (sub === "enable") {
      existing.enabled = true;
      console.log(`Enabled target ${targetId}`);
      return;
    }
    if (sub === "disable") {
      existing.enabled = false;
      console.log(`Disabled target ${targetId}`);
      return;
    }
    if (sub === "remove") {
      delete stack.targets[targetId];
      console.log(`Removed target ${targetId}`);
      return;
    }

    throw new Error(`Unknown target subcommand: ${sub}`);
  });
}

async function handleGuardCommand(positional, flags) {
  const sub = positional[1];
  const serverId = requireValue(flags.server, "Missing --server for guard command");
  const action = requireValue(flags.action, "Missing --action for guard command");
  const stack = await loadStackFile();

  if (sub === "check") {
    const result = evaluateSafety({ stack, serverId: String(serverId), action: String(action) });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (sub === "run") {
    const result = await guardAction({ stack, serverId: String(serverId), action: String(action) });
    if (!result.allow) {
      console.log(`Blocked: ${result.reason}`);
      process.exitCode = 2;
      return;
    }
    console.log(`Allowed: ${result.reason}`);
    return;
  }

  throw new Error("guard subcommand must be check or run");
}

async function handleAuthCommand(positional, flags) {
  const sub = positional[1];
  const serverId = positional[2];
  requireValue(sub, "Missing auth subcommand");
  requireValue(serverId, "Missing server id for auth command");

  if (sub === "set") {
    const env = parseEnvCsv(String(requireValue(flags.env, "Missing --env for auth set")));
    await updateStack(async (stack) => {
      const server = stack.servers[serverId];
      if (!server) {
        throw new Error(`Unknown server: ${serverId}`);
      }
      server.env = {
        ...(server.env || {}),
        ...env
      };
    });
    console.log(`Updated auth env for ${serverId}`);
    return;
  }

  if (sub === "show") {
    const stack = await loadStackFile();
    const server = stack.servers[serverId];
    if (!server) {
      throw new Error(`Unknown server: ${serverId}`);
    }
    const status = getAuthStatus(server);
    const masked = {};
    for (const [key, value] of Object.entries(server.env || {})) {
      const str = String(value);
      masked[key] = str.length <= 4 ? "****" : `${str.slice(0, 2)}***${str.slice(-2)}`;
    }
    console.log(
      JSON.stringify(
        {
          serverId,
          package: server.package,
          status,
          env: masked
        },
        null,
        2
      )
    );
    return;
  }

  if (sub === "login") {
    const stack = await loadStackFile();
    const server = stack.servers[serverId];
    if (!server) {
      throw new Error(`Unknown server: ${serverId}`);
    }

    const result = await interactiveAuthLogin(serverId, server);
    if (Object.keys(result.updatedEnv).length === 0) {
      console.log(result.note);
      return;
    }

    await updateStack(async (nextStack) => {
      const nextServer = nextStack.servers[serverId];
      nextServer.env = {
        ...(nextServer.env || {}),
        ...result.updatedEnv
      };
    });

    console.log(`Auth env updated for ${serverId}`);
    console.log("Run `node src/index.js apply` to propagate to targets.");
    return;
  }

  throw new Error("auth subcommand must be set, login, or show");
}

async function handleSuperviseCommand(positional, flags) {
  const sub = positional[1];
  if (sub !== "start") {
    throw new Error("supervise subcommand must be start");
  }

  const stack = await loadStackFile();
  const restarts = Number(flags.restarts || 3);
  const supervisor = startSupervisor(stack, { maxRestarts: Number.isFinite(restarts) ? restarts : 3 });

  supervisor.startAll();
  console.log("Supervisor started. Press Ctrl+C to stop.");

  const onSignal = () => {
    supervisor.stopAll();
    process.exit(0);
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  setInterval(() => {
    const rows = supervisor.listStatus();
    if (rows.length === 0) {
      console.log("[supervisor] no running servers");
      return;
    }
    for (const row of rows) {
      console.log(`[supervisor] ${row.serverId} pid=${row.pid} restarts=${row.restarts}`);
    }
  }, 15000);
}

async function handleSetup(flags) {
  const initResult = await initStackFile();
  if (initResult.created) {
    console.log(`Created ${initResult.path}`);
  } else {
    console.log(`Using existing ${initResult.path}`);
  }

  const requestedScope = String(flags.scope || "").trim().toLowerCase();
  const scope = requestedScope === "global" ? "global" : "project";
  const setupMode = String(flags.mode || "minimal").trim().toLowerCase();
  const enableAllEssentials = setupMode === "all" || Boolean(flags.allEssentials);

  if (Boolean(flags.yes)) {
    await updateStack(async (stack) => {
      for (const [targetId, targetPath] of Object.entries(TARGET_SCOPE_PATHS[scope])) {
        if (stack.targets[targetId]) {
          stack.targets[targetId].path = targetPath;
        }
      }

      for (const serverId of Object.keys(ESSENTIAL_SERVERS)) {
        if (!stack.servers[serverId]) {
          continue;
        }
        if (enableAllEssentials) {
          stack.servers[serverId].enabled = true;
        } else {
          stack.servers[serverId].enabled = ["filesystem", "memory", "sequential-thinking"].includes(serverId);
        }
      }

      if (stack.targets["claude-code"]) {
        stack.targets["claude-code"].enabled = true;
      }
      if (stack.targets.opencode) {
        stack.targets.opencode.enabled = true;
      }
      if (stack.targets.cursor) {
        stack.targets.cursor.enabled = false;
      }
      stack.safetyGate.mode = "prompt";
    });
  } else {
    await runWizard(updateStack, { yes: false });
  }

  const stack = await loadStackFile();
  const result = await applyStack(stack);
  printApply(result);
}

async function handleMenu() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const initResult = await initStackFile();
    if (initResult.created) {
      console.log(`Created ${initResult.path}`);
    }

    let running = true;
    while (running) {
      console.log("\nMCP Hub Menu");
      console.log("(mcp-starter beginner mode)");
      console.log("1) Quick setup (minimal)");
      console.log("2) Quick setup (all essentials)");
      console.log("3) List current config");
      console.log("4) Add preset MCP");
      console.log("5) Add custom MCP");
      console.log("6) Configure auth");
      console.log("7) Apply config to targets");
      console.log("8) Exit");

      const choice = (await rl.question("Choose an option [1-8]: ")).trim();

      if (choice === "1" || choice === "2") {
        const scopeInput = (await rl.question("Scope: project or global? [project]: ")).trim().toLowerCase();
        const scope = scopeInput === "global" ? "global" : "project";
        const mode = choice === "2" ? "all" : "minimal";
        await handleSetup({ yes: true, scope, mode });
        continue;
      }

      if (choice === "3") {
        const stack = await loadStackFile();
        printValidate(stack);
        continue;
      }

      if (choice === "4") {
        printPresetCatalog(PRESET_CATALOG);
        const presetId = (await rl.question("Preset id to add/enable: ")).trim();
        if (!presetId) {
          console.log("No preset selected.");
          continue;
        }
        const preset = createServerFromPreset(presetId);
        if (!preset) {
          console.log(`Unknown preset: ${presetId}`);
          continue;
        }

        await updateStack(async (stack) => {
          if (stack.servers[presetId]) {
            stack.servers[presetId].enabled = true;
          } else {
            stack.servers[presetId] = preset;
          }
        });

        const presetMeta = PRESET_CATALOG[presetId];
        if (presetMeta?.auth?.envKeys?.length) {
          const doAuth = await rl.question(`This preset requires auth (${presetMeta.auth.envKeys.join(",")}). Configure now? [y/N]: `);
          if (askToBool(doAuth)) {
            const envInput = await rl.question(`Enter env pairs (KEY=VALUE, comma-separated): `);
            const env = parseEnvCsv(envInput);
            await updateStack(async (stack) => {
              const server = stack.servers[presetId];
              server.env = {
                ...(server.env || {}),
                ...env
              };
            });
          }
        }

        console.log(`Preset ready: ${presetId}`);
        continue;
      }

      if (choice === "5") {
        const id = (await rl.question("Server id: ")).trim();
        const pkg = (await rl.question("NPM package: ")).trim();
        const argsRaw = (await rl.question("Args (comma-separated, optional): ")).trim();
        const envRaw = (await rl.question("Env (KEY=VALUE, comma-separated, optional): ")).trim();

        if (!id || !pkg) {
          console.log("Server id and package are required.");
          continue;
        }

        await updateStack(async (stack) => {
          stack.servers[id] = {
            enabled: true,
            package: pkg,
            args: argsRaw ? parseCsv(argsRaw) : [],
            env: envRaw ? parseEnvCsv(envRaw) : {},
            safety: {
              level: "medium",
              requireApproval: true,
              riskyActions: []
            }
          };
        });
        console.log(`Custom MCP added: ${id}`);
        continue;
      }

      if (choice === "6") {
        const serverId = (await rl.question("Server id for auth: ")).trim();
        if (!serverId) {
          console.log("No server id provided.");
          continue;
        }

        const stack = await loadStackFile();
        const server = stack.servers[serverId];
        if (!server) {
          console.log(`Unknown server: ${serverId}`);
          continue;
        }

        const status = getAuthStatus(server);
        console.log(`Auth status: ${status.configured ? "configured" : "missing"}`);
        console.log(status.message);
        const method = (await rl.question("Use guided login? [Y/n]: ")).trim().toLowerCase();
        if (method === "" || askToBool(method)) {
          const result = await interactiveAuthLogin(serverId, server);
          if (Object.keys(result.updatedEnv).length > 0) {
            await updateStack(async (next) => {
              next.servers[serverId].env = {
                ...(next.servers[serverId].env || {}),
                ...result.updatedEnv
              };
            });
            console.log("Auth values saved.");
          } else {
            console.log(result.note);
          }
        } else {
          const envRaw = await rl.question("Enter env (KEY=VALUE, comma-separated): ");
          const env = parseEnvCsv(envRaw);
          await updateStack(async (next) => {
            next.servers[serverId].env = {
              ...(next.servers[serverId].env || {}),
              ...env
            };
          });
          console.log("Auth values saved.");
        }
        continue;
      }

      if (choice === "7") {
        const stack = await loadStackFile();
        const result = await applyStack(stack);
        printApply(result);
        continue;
      }

      if (choice === "8") {
        running = false;
        continue;
      }

      console.log("Invalid option. Pick 1-8.");
    }
  } finally {
    rl.close();
  }
}

async function run() {
  const rawArgs = process.argv.slice(2);
  const { positional, flags } = parseFlags(rawArgs);
  const command = positional[0] || "help";

  if (["help", "-h", "--help"].includes(command)) {
    printHelp();
    return;
  }

  if (command === "init") {
    const result = await initStackFile();
    console.log(result.created ? `Created ${result.path}` : `Stack already exists: ${result.path}`);
    return;
  }

  if (command === "validate") {
    const stack = await loadStackFile();
    printValidate(stack);
    return;
  }

  if (command === "apply") {
    const stack = await loadStackFile();
    const result = await applyStack(stack);
    printApply(result);
    return;
  }

  if (command === "wizard") {
    await runWizard(updateStack, { yes: Boolean(flags.yes) });
    const stack = await loadStackFile();
    printValidate(stack);
    return;
  }

  if (command === "setup") {
    await handleSetup(flags);
    return;
  }

  if (command === "import") {
    const stack = await loadStackFile();
    const result = await importTargetsIntoStack(stack);
    await updateStack(async (nextStack) => {
      nextStack.servers = result.stack.servers;
    });
    console.log(`Imported ${result.imported.length} servers from target configs`);
    for (const item of result.imported) {
      console.log(`- ${item.serverId} from ${item.targetId}`);
    }
    return;
  }

  if (command === "list") {
    const stack = await loadStackFile();
    console.log("Servers:");
    for (const [id, server] of Object.entries(stack.servers)) {
      console.log(`- ${id} [${server.enabled ? "enabled" : "disabled"}] ${server.package}`);
    }
    console.log("Targets:");
    for (const [id, target] of Object.entries(stack.targets)) {
      console.log(`- ${id} [${target.enabled ? "enabled" : "disabled"}] ${target.path}`);
    }
    return;
  }

  if (command === "presets") {
    printPresetCatalog(PRESET_CATALOG);
    return;
  }

  if (command === "menu") {
    await handleMenu();
    return;
  }

  if (["add", "remove", "enable", "disable"].includes(command)) {
    await handleServerCommand(command, positional, flags);
    return;
  }

  if (command === "target") {
    await handleTargetCommand(positional, flags);
    return;
  }

  if (command === "guard") {
    await handleGuardCommand(positional, flags);
    return;
  }

  if (command === "supervise") {
    await handleSuperviseCommand(positional, flags);
    return;
  }

  if (command === "auth") {
    await handleAuthCommand(positional, flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
