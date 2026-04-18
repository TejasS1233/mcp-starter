import { readFile } from "node:fs/promises";
import { safeParseJson } from "./utils.js";

async function readTargetJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return safeParseJson(raw, null);
  } catch {
    return null;
  }
}

function extractServersByFormat(json, format) {
  if (!json || typeof json !== "object") {
    return {};
  }

  if (format === "claude") {
    return json.mcpServers || {};
  }
  if (format === "opencode") {
    return json.mcp?.servers || {};
  }
  if (format === "cursor") {
    return json.mcpServers || {};
  }
  return json.mcpServers || {};
}

function normalizeImportedServer(server) {
  const args = Array.isArray(server.args) ? [...server.args] : [];
  let packageName = "";
  let normalizedArgs = [];

  if (args.length > 0 && (server.command || "npx") === "npx") {
    const copy = [...args];
    while (copy.length > 0 && String(copy[0]).startsWith("-")) {
      copy.shift();
    }
    packageName = copy[0] ? String(copy[0]) : "";
    normalizedArgs = copy.slice(1).map((item) => String(item));
  } else {
    normalizedArgs = args.map((item) => String(item));
  }

  if (!packageName && typeof server.package === "string") {
    packageName = server.package;
  }

  if (!packageName) {
    return null;
  }

  return {
    enabled: true,
    package: packageName,
    args: normalizedArgs,
    env: server.env || {},
    safety: {
      level: "medium",
      requireApproval: true,
      riskyActions: []
    }
  };
}

export async function importTargetsIntoStack(stack) {
  const imported = [];
  const servers = { ...stack.servers };

  for (const [targetId, target] of Object.entries(stack.targets || {})) {
    const json = await readTargetJson(target.resolvedPath || target.path);
    const found = extractServersByFormat(json, target.format);

    for (const [serverId, serverConfig] of Object.entries(found)) {
      if (servers[serverId]) {
        continue;
      }
      const normalized = normalizeImportedServer(serverConfig);
      if (!normalized) {
        continue;
      }
      servers[serverId] = normalized;
      imported.push({ targetId, serverId });
    }
  }

  return {
    stack: {
      ...stack,
      servers
    },
    imported
  };
}
