import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DEFAULT_TARGETS, ESSENTIAL_SERVERS, STACK_FILE } from "./constants.js";
import { deepClone, expandHome } from "./utils.js";

const TEMPLATE_OBJECT = {
  version: 1,
  project: "mcp-hub",
  defaults: {
    stdioCommand: "npx",
    stdioArgsPrefix: ["-y"]
  },
  servers: deepClone(ESSENTIAL_SERVERS),
  targets: deepClone(DEFAULT_TARGETS),
  safetyGate: {
    enabled: true,
    mode: "prompt",
    highRiskRequiresApproval: true
  }
};

function parseStack(raw, stackFilePath) {
  const parsed = YAML.parse(raw) || {};
  if (!parsed.servers || typeof parsed.servers !== "object") {
    throw new Error("Invalid stack: missing servers section");
  }
  if (!parsed.targets || typeof parsed.targets !== "object") {
    throw new Error("Invalid stack: missing targets section");
  }

  return {
    ...deepClone(TEMPLATE_OBJECT),
    ...parsed,
    defaults: {
      ...deepClone(TEMPLATE_OBJECT.defaults),
      ...(parsed.defaults || {})
    },
    servers: {
      ...deepClone(TEMPLATE_OBJECT.servers),
      ...(parsed.servers || {})
    },
    targets: {
      ...deepClone(TEMPLATE_OBJECT.targets),
      ...(parsed.targets || {})
    },
    safetyGate: {
      ...deepClone(TEMPLATE_OBJECT.safetyGate),
      ...(parsed.safetyGate || {})
    },
    meta: {
      stackFile: stackFilePath
    }
  };
}

function toYaml(obj) {
  return YAML.stringify(obj, { indent: 2 });
}

export async function initStackFile() {
  const stackPath = path.resolve(process.cwd(), STACK_FILE);

  try {
    await access(stackPath);
    return { created: false, path: stackPath };
  } catch {
    await writeFile(stackPath, toYaml(TEMPLATE_OBJECT), "utf8");
    return { created: true, path: stackPath };
  }
}

export async function loadStackFile() {
  const stackPath = path.resolve(process.cwd(), STACK_FILE);
  const raw = await readFile(stackPath, "utf8");
  const stack = parseStack(raw, stackPath);

  for (const [, target] of Object.entries(stack.targets)) {
    target.resolvedPath = expandHome(target.path);
  }

  return stack;
}

export async function saveStackFile(stack) {
  const stackPath = path.resolve(process.cwd(), STACK_FILE);
  const { meta, ...persisted } = stack;
  const normalizedTargets = {};
  for (const [targetId, target] of Object.entries(persisted.targets || {})) {
    const { resolvedPath, ...safeTarget } = target;
    normalizedTargets[targetId] = safeTarget;
  }
  persisted.targets = normalizedTargets;
  await writeFile(stackPath, toYaml(persisted), "utf8");
  return stackPath;
}

export async function updateStack(mutator) {
  const stack = await loadStackFile();
  await mutator(stack);
  await saveStackFile(stack);
  return stack;
}
