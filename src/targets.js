import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeParseJson } from "./utils.js";

function buildMcpServers(stack) {
  const servers = {};

  for (const [id, server] of Object.entries(stack.servers)) {
    if (!server.enabled) {
      continue;
    }

    const command = stack.defaults?.stdioCommand || "npx";
    const argsPrefix = stack.defaults?.stdioArgsPrefix || ["-y"];
    const extraArgs = server.args || [];

    servers[id] = {
      command,
      args: [...argsPrefix, server.package, ...extraArgs],
      env: server.env || {}
    };
  }

  return servers;
}

function buildSafetyReport(stack) {
  const rows = [];
  for (const [id, server] of Object.entries(stack.servers)) {
    if (!server.enabled) {
      continue;
    }

    rows.push({
      id,
      level: server.safety?.level || "unknown",
      requireApproval: Boolean(server.safety?.requireApproval),
      riskyActions: server.safety?.riskyActions || []
    });
  }
  return rows;
}

async function ensureDirForFile(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readExistingConfig(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return { exists: true, raw, json: safeParseJson(raw, {}) };
  } catch {
    return { exists: false, raw: "", json: {} };
  }
}

function mergeForTarget(target, existingJson, mcpServers, safetyReport, stack) {
  const out = { ...existingJson };
  const safety = stack.safetyGate?.enabled
    ? {
        mode: stack.safetyGate.mode || "report",
        highRiskRequiresApproval: Boolean(stack.safetyGate.highRiskRequiresApproval),
        servers: safetyReport
      }
    : undefined;

  if (target.format === "claude") {
    out.mcpServers = mcpServers;
    if (safety) {
      out.mcpSafety = safety;
    }
    return out;
  }

  if (target.format === "opencode") {
    out.mcp = out.mcp || {};
    out.mcp.servers = mcpServers;
    if (safety) {
      out.mcp.safety = safety;
    }
    return out;
  }

  if (target.format === "cursor") {
    out.mcpServers = mcpServers;
    if (safety) {
      out.mcpSafety = safety;
    }
    return out;
  }

  return {
    ...out,
    mcpServers
  };
}

export async function applyStack(stack) {
  const written = [];
  const skipped = [];

  const mcpServers = buildMcpServers(stack);
  const safetyReport = buildSafetyReport(stack);

  for (const [targetId, target] of Object.entries(stack.targets || {})) {
    if (!target.enabled) {
      skipped.push({ targetId, reason: "disabled" });
      continue;
    }

    const targetPath = target.resolvedPath || target.path;
    await ensureDirForFile(targetPath);

    const existing = await readExistingConfig(targetPath);
    const merged = mergeForTarget(target, existing.json, mcpServers, safetyReport, stack);
    const nextRaw = `${JSON.stringify(merged, null, 2)}\n`;

    let backupPath;
    if (existing.exists) {
      backupPath = `${targetPath}.bak`;
      await writeFile(backupPath, existing.raw, "utf8");
    }

    await writeFile(targetPath, nextRaw, "utf8");
    written.push({ targetId, path: targetPath, backupPath });
  }

  return { written, skipped };
}
