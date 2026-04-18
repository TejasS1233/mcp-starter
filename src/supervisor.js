import { spawn } from "node:child_process";

function buildSpawnConfig(server, defaults) {
  const command = defaults?.stdioCommand || "npx";
  const argsPrefix = defaults?.stdioArgsPrefix || ["-y"];
  const extraArgs = server.args || [];
  return {
    command,
    args: [...argsPrefix, server.package, ...extraArgs],
    env: {
      ...process.env,
      ...(server.env || {})
    }
  };
}

export function startSupervisor(stack, { maxRestarts = 3 } = {}) {
  const processes = new Map();

  function startServer(serverId, restartCount = 0) {
    const server = stack.servers?.[serverId];
    if (!server || !server.enabled) {
      return;
    }

    const { command, args, env } = buildSpawnConfig(server, stack.defaults);
    const child = spawn(command, args, {
      env,
      stdio: "pipe",
      shell: true
    });

    const key = serverId;
    processes.set(key, { child, restartCount });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[${serverId}] ${chunk.toString()}`);
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${serverId}][err] ${chunk.toString()}`);
    });

    child.on("exit", (code) => {
      const entry = processes.get(key);
      if (!entry) {
        return;
      }
      processes.delete(key);
      if (restartCount < maxRestarts) {
        const next = restartCount + 1;
        console.log(`[supervisor] ${serverId} exited with ${code}, restarting (${next}/${maxRestarts})`);
        startServer(serverId, next);
      } else {
        console.log(`[supervisor] ${serverId} exited with ${code}, max restarts reached`);
      }
    });
  }

  function startAll() {
    for (const [serverId, server] of Object.entries(stack.servers || {})) {
      if (server.enabled) {
        startServer(serverId, 0);
      }
    }
  }

  function stopAll() {
    for (const [, entry] of processes.entries()) {
      entry.child.kill();
    }
    processes.clear();
  }

  function listStatus() {
    const rows = [];
    for (const [serverId, entry] of processes.entries()) {
      rows.push({
        serverId,
        pid: entry.child.pid,
        restarts: entry.restartCount
      });
    }
    return rows;
  }

  return {
    startAll,
    stopAll,
    listStatus
  };
}
