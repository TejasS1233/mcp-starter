import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed (${command} ${args.join(" ")})\n${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function assertContains(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected output to include \"${needle}\" in ${context}`);
  }
}

async function cleanup() {
  const stackPath = path.join(root, "mcp-stack.yaml");
  await rm(stackPath, { force: true });
}

async function main() {
  await cleanup();

  const help = await run("node", ["src/index.js", "help"]);
  assertContains(help.stdout, "mcp-starter - beginner-friendly MCP setup manager", "help");
  assertContains(help.stdout, "mcp-starter menu", "help menu command");

  const init = await run("node", ["src/index.js", "init"]);
  assertContains(init.stdout, "Created", "init");

  const validate = await run("node", ["src/index.js", "validate"]);
  assertContains(validate.stdout, "Enabled servers:", "validate");

  await run("node", ["src/index.js", "setup", "--yes", "--scope", "project", "--mode", "all"]);

  const presets = await run("node", ["src/index.js", "presets"]);
  assertContains(presets.stdout, "filesystem", "presets");
  assertContains(presets.stdout, "postgres", "presets");

  await run("node", [
    "src/index.js",
    "add",
    "github",
    "--package",
    "@modelcontextprotocol/server-github",
    "--env",
    "GITHUB_TOKEN=testtoken"
  ]);

  const authShow = await run("node", ["src/index.js", "auth", "show", "github"]);
  assertContains(authShow.stdout, "GITHUB_TOKEN", "auth show");

  await run("node", ["src/index.js", "auth", "set", "github", "--env", "GITHUB_TOKEN=updatedtoken"]);

  const list = await run("node", ["src/index.js", "list"]);
  assertContains(list.stdout, "Servers:", "list");
  assertContains(list.stdout, "Targets:", "list");

  const guard = await run("node", ["src/index.js", "guard", "check", "--server", "filesystem", "--action", "write-file"]);
  assertContains(guard.stdout, "Approval required", "guard check");

  await run("node", ["src/index.js", "import"]);
  await run("node", ["src/index.js", "apply"]);

  console.log("Smoke tests passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
