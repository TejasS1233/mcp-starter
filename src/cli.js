import { createInterface } from "node:readline/promises";
import process from "node:process";
import { DEFAULT_TARGETS, ESSENTIAL_SERVERS, TARGET_SCOPE_PATHS } from "./constants.js";
import { parseCsv } from "./utils.js";

function parseBool(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function parseFlags(args) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }

  return { positional, flags };
}

export function printHelp() {
  console.log(`mcp-starter - beginner-friendly MCP setup manager

Usage:
  mcp-starter init
  mcp-starter menu
  mcp-starter list
  mcp-starter presets
  mcp-starter validate
  mcp-starter apply
  mcp-starter wizard
  mcp-starter setup [--yes] [--scope global|project] [--mode minimal|all]
  mcp-starter import
  mcp-starter add <serverId> --package <npmPackage> [--args "a,b"] [--env "K=V,K2=V2"]
  mcp-starter remove <serverId>
  mcp-starter enable <serverId>
  mcp-starter disable <serverId>
  mcp-starter target enable <targetId>
  mcp-starter target disable <targetId>
  mcp-starter target add <targetId> --format <claude|opencode|cursor> --path <file>
  mcp-starter guard check --server <serverId> --action <name>
  mcp-starter guard run --server <serverId> --action <name>
  mcp-starter supervise start [--restarts 3]
  mcp-starter auth set <serverId> --env "K=V,K2=V2"
  mcp-starter auth login <serverId>
  mcp-starter auth show <serverId>
  mcp-starter help
`);
}

export function printValidate(stack) {
  const enabledServers = Object.entries(stack.servers).filter(([, value]) => value.enabled);
  const enabledTargets = Object.entries(stack.targets).filter(([, value]) => value.enabled);

  console.log(`Stack file: ${stack.meta.stackFile}`);
  console.log(`Enabled servers: ${enabledServers.length}`);
  console.log(`Enabled targets: ${enabledTargets.length}`);
  for (const [id, server] of enabledServers) {
    console.log(`- ${id}: ${server.package}`);
  }
  for (const [id, target] of enabledTargets) {
    console.log(`- target ${id}: ${target.path}`);
  }
}

export function printApply(result) {
  if (result.written.length === 0) {
    console.log("No targets were written. Enable at least one target in mcp-stack.yaml.");
    return;
  }
  for (const item of result.written) {
    console.log(`Updated ${item.targetId}: ${item.path}`);
    if (item.backupPath) {
      console.log(`  backup: ${item.backupPath}`);
    }
  }
  for (const item of result.skipped) {
    console.log(`Skipped ${item.targetId}: ${item.reason}`);
  }
}

export async function runWizard(updateStack, options = {}) {
  const yesMode = Boolean(options.yes);

  if (yesMode) {
    await updateStack(async (stack) => {
      stack.safetyGate.mode = stack.safetyGate.mode || "prompt";
      for (const serverId of Object.keys(ESSENTIAL_SERVERS)) {
        if (stack.servers[serverId]) {
          if (["filesystem", "memory", "sequential-thinking"].includes(serverId)) {
            stack.servers[serverId].enabled = true;
          }
          if (["git", "postgres"].includes(serverId)) {
            stack.servers[serverId].enabled = false;
          }
        }
      }
      for (const [targetId] of Object.entries(DEFAULT_TARGETS)) {
        if (stack.targets[targetId]) {
          stack.targets[targetId].enabled = targetId !== "cursor";
        }
      }
    });
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await updateStack(async (stack) => {
      console.log("\nMCP Starter wizard\n");

      const scopeAnswer = await rl.question("Setup scope: global or project? [project]: ");
      const scopeNormalized = scopeAnswer.trim().toLowerCase();
      const scope = scopeNormalized === "global" ? "global" : "project";
      const scopePaths = TARGET_SCOPE_PATHS[scope];

      for (const [targetId, targetPath] of Object.entries(scopePaths)) {
        if (stack.targets[targetId]) {
          stack.targets[targetId].path = targetPath;
        }
      }

      if (scope === "project") {
        console.log("Using project-local target paths (.claude/.opencode/.cursor)");
      } else {
        console.log("Using global target paths (~/.claude ~/.config/opencode ~/.cursor)");
      }

      const safetyMode = await rl.question("Safety mode (prompt/report) [prompt]: ");
      if (safetyMode.trim()) {
        stack.safetyGate.mode = safetyMode.trim();
      }

      for (const serverId of Object.keys(ESSENTIAL_SERVERS)) {
        const current = stack.servers[serverId]?.enabled ? "y" : "n";
        const answer = await rl.question(`Enable ${serverId}? [y/n] (${current}): `);
        const parsed = parseBool(answer || current);
        if (typeof parsed === "boolean") {
          stack.servers[serverId].enabled = parsed;
        }
      }

      for (const [targetId] of Object.entries(DEFAULT_TARGETS)) {
        const current = stack.targets[targetId]?.enabled ? "y" : "n";
        const answer = await rl.question(`Enable target ${targetId}? [y/n] (${current}): `);
        const parsed = parseBool(answer || current);
        if (typeof parsed === "boolean") {
          stack.targets[targetId].enabled = parsed;
        }
      }

      const addCustom = await rl.question("Add a custom MCP server now? [y/N]: ");
      if (parseBool(addCustom)) {
        const id = (await rl.question("Server id: ")).trim();
        const pkg = (await rl.question("NPM package: ")).trim();
        const argsRaw = (await rl.question("Args CSV (optional): ")).trim();
        if (id && pkg) {
          stack.servers[id] = {
            enabled: true,
            package: pkg,
            args: argsRaw ? parseCsv(argsRaw) : [],
            env: {},
            safety: {
              level: "medium",
              requireApproval: true,
              riskyActions: []
            }
          };
        }
      }
    });
  } finally {
    rl.close();
  }
}

export function printPresetCatalog(catalog) {
  console.log("Available MCP presets:");
  for (const [id, preset] of Object.entries(catalog)) {
    const authLabel = preset.auth ? `auth: ${preset.auth.envKeys.join(",")}` : "auth: none";
    console.log(`- ${id}: ${preset.description} (${authLabel})`);
  }
}
