import { createInterface } from "node:readline/promises";
import process from "node:process";

const AUTH_HINTS = {
  "@modelcontextprotocol/server-github": {
    envKeys: ["GITHUB_TOKEN"],
    message: "Create a GitHub personal access token and set GITHUB_TOKEN."
  },
  "@modelcontextprotocol/server-slack": {
    envKeys: ["SLACK_BOT_TOKEN"],
    message: "Create a Slack bot token and set SLACK_BOT_TOKEN."
  },
  "@modelcontextprotocol/server-notion": {
    envKeys: ["NOTION_API_KEY"],
    message: "Create a Notion integration token and set NOTION_API_KEY."
  },
  "@modelcontextprotocol/server-postgres": {
    envKeys: ["DATABASE_URL"],
    message: "Set DATABASE_URL for your Postgres instance."
  }
};

function getHintsForServer(server) {
  const pkg = server?.package;
  if (!pkg) {
    return null;
  }
  return AUTH_HINTS[pkg] || null;
}

export function getAuthStatus(server) {
  const hints = getHintsForServer(server);
  const env = server?.env || {};
  if (!hints) {
    return {
      known: false,
      envKeys: Object.keys(env),
      configured: Object.keys(env).length > 0,
      message: "No built-in auth hints for this package."
    };
  }

  const missing = hints.envKeys.filter((key) => !env[key]);
  return {
    known: true,
    envKeys: hints.envKeys,
    configured: missing.length === 0,
    missing,
    message: hints.message
  };
}

export async function interactiveAuthLogin(serverId, server) {
  const hints = getHintsForServer(server);
  if (!hints) {
    return {
      serverId,
      updatedEnv: {},
      note: "No predefined auth prompts. Use auth set with --env."
    };
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const updatedEnv = {};
  try {
    console.log(`[auth] ${serverId}: ${hints.message}`);
    for (const key of hints.envKeys) {
      const answer = await rl.question(`[auth] Enter value for ${key} (leave blank to skip): `);
      const value = answer.trim();
      if (value) {
        updatedEnv[key] = value;
      }
    }
  } finally {
    rl.close();
  }

  return {
    serverId,
    updatedEnv,
    note: Object.keys(updatedEnv).length > 0 ? "Auth env updated" : "No values provided"
  };
}
