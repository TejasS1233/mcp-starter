export const STACK_FILE = "mcp-stack.yaml";

export const PRESET_CATALOG = {
  filesystem: {
    id: "filesystem",
    package: "@modelcontextprotocol/server-filesystem",
    args: ["."],
    description: "Read/write local files",
    auth: null,
    safety: {
      level: "medium",
      requireApproval: false,
      riskyActions: ["delete", "write", "move"]
    }
  },
  memory: {
    id: "memory",
    package: "@modelcontextprotocol/server-memory",
    args: [],
    description: "Persistent memory for agent context",
    auth: null,
    safety: {
      level: "low",
      requireApproval: false,
      riskyActions: []
    }
  },
  "sequential-thinking": {
    id: "sequential-thinking",
    package: "@modelcontextprotocol/server-sequential-thinking",
    args: [],
    description: "Structured reasoning helper",
    auth: null,
    safety: {
      level: "low",
      requireApproval: false,
      riskyActions: []
    }
  },
  git: {
    id: "git",
    package: "@modelcontextprotocol/server-git",
    args: ["."],
    description: "Git operations in current repo",
    auth: null,
    safety: {
      level: "medium",
      requireApproval: true,
      riskyActions: ["reset", "checkout", "delete-branch", "force-push"]
    }
  },
  postgres: {
    id: "postgres",
    package: "@modelcontextprotocol/server-postgres",
    args: ["postgresql://localhost:5432/postgres"],
    description: "Query Postgres databases",
    auth: {
      envKeys: ["DATABASE_URL"]
    },
    safety: {
      level: "high",
      requireApproval: true,
      riskyActions: ["drop", "delete", "truncate", "update", "alter"]
    }
  },
  github: {
    id: "github",
    package: "@modelcontextprotocol/server-github",
    args: [],
    description: "GitHub issues, PRs, repos",
    auth: {
      envKeys: ["GITHUB_TOKEN"]
    },
    safety: {
      level: "medium",
      requireApproval: true,
      riskyActions: ["create", "merge", "delete", "close"]
    }
  }
};

export const ESSENTIAL_SERVERS = {
  filesystem: {
    enabled: true,
    package: "@modelcontextprotocol/server-filesystem",
    args: ["."],
    env: {},
    safety: {
      level: "medium",
      requireApproval: false,
      riskyActions: ["delete", "write", "move"]
    }
  },
  memory: {
    enabled: true,
    package: "@modelcontextprotocol/server-memory",
    args: [],
    env: {},
    safety: {
      level: "low",
      requireApproval: false,
      riskyActions: []
    }
  },
  "sequential-thinking": {
    enabled: true,
    package: "@modelcontextprotocol/server-sequential-thinking",
    args: [],
    env: {},
    safety: {
      level: "low",
      requireApproval: false,
      riskyActions: []
    }
  },
  git: {
    enabled: false,
    package: "@modelcontextprotocol/server-git",
    args: ["."],
    env: {},
    safety: {
      level: "medium",
      requireApproval: true,
      riskyActions: ["reset", "checkout", "delete-branch", "force-push"]
    }
  },
  postgres: {
    enabled: false,
    package: "@modelcontextprotocol/server-postgres",
    args: ["postgresql://localhost:5432/postgres"],
    env: {},
    safety: {
      level: "high",
      requireApproval: true,
      riskyActions: ["drop", "delete", "truncate", "update", "alter"]
    }
  }
};

export const DEFAULT_TARGETS = {
  "claude-code": {
    enabled: true,
    format: "claude",
    path: "~/.claude/settings.json"
  },
  opencode: {
    enabled: true,
    format: "opencode",
    path: "~/.config/opencode/mcp.json"
  },
  cursor: {
    enabled: false,
    format: "cursor",
    path: "~/.cursor/mcp.json"
  }
};

export const TARGET_SCOPE_PATHS = {
  global: {
    "claude-code": "~/.claude/settings.json",
    opencode: "~/.config/opencode/mcp.json",
    cursor: "~/.cursor/mcp.json"
  },
  project: {
    "claude-code": ".claude/settings.json",
    opencode: ".opencode/mcp.json",
    cursor: ".cursor/mcp.json"
  }
};

export function createServerFromPreset(presetId) {
  const preset = PRESET_CATALOG[presetId];
  if (!preset) {
    return null;
  }

  return {
    enabled: true,
    package: preset.package,
    args: [...(preset.args || [])],
    env: {},
    safety: {
      level: preset.safety?.level || "medium",
      requireApproval: Boolean(preset.safety?.requireApproval),
      riskyActions: [...(preset.safety?.riskyActions || [])]
    }
  };
}
