# mcp-starter

Set up MCP for Claude Code, OpenCode, and Cursor in minutes.

`mcp-starter` gives you one command flow for project or global MCP setup, preset servers, auth env wiring, and target config sync.

## Features

- Menu-based onboarding: `mcp-starter menu`
- Quick setup modes: minimal or all essentials
- Scope switch: project-local (`.claude/.opencode/.cursor`) or global (`~/.claude`, `~/.config/opencode`, `~/.cursor`)
- Preset catalog with auth hints
- Auth commands (`auth set`, `auth login`, `auth show`)
- Import existing MCP entries from target configs
- Safe apply with backup files (`.bak`)

## Install

```bash
npm i -g @tejas_sidhwani/mcp-starter
```

## 30-second start

```bash
mcp-starter menu
```

Recommended first path:
1. Quick setup (all essentials)
2. Choose scope (project or global)
3. Configure auth where needed
4. Apply

## Fast non-interactive setup

```bash
mcp-starter setup --yes --scope project --mode all
mcp-starter validate
```

## Presets and auth

View presets:

```bash
mcp-starter presets
```

Add a preset or custom MCP:

```bash
mcp-starter add github --package @modelcontextprotocol/server-github --env "GITHUB_TOKEN=ghp_xxx"
mcp-starter add jira --package @example/jira-mcp --args "--project,ABC"
```

Auth commands:

```bash
mcp-starter auth set github --env "GITHUB_TOKEN=ghp_xxx"
mcp-starter auth login github
mcp-starter auth show github
```

Apply to targets:

```bash
mcp-starter apply
```

## Commands

```bash
mcp-starter help
mcp-starter menu
mcp-starter setup [--yes] [--scope global|project] [--mode minimal|all]
mcp-starter presets
mcp-starter list
mcp-starter validate
mcp-starter apply
mcp-starter import

mcp-starter add <serverId> --package <npmPackage> [--args "a,b"] [--env "K=V,K2=V2"]
mcp-starter remove <serverId>
mcp-starter enable <serverId>
mcp-starter disable <serverId>

mcp-starter auth set <serverId> --env "K=V,K2=V2"
mcp-starter auth login <serverId>
mcp-starter auth show <serverId>

mcp-starter guard check --server <serverId> --action <name>
mcp-starter guard run --server <serverId> --action <name>
mcp-starter supervise start --restarts 3
```

## Testing

```bash
npm run test:smoke
```
