import path from "node:path";
import process from "node:process";

export function expandHome(filePath) {
  if (!filePath.startsWith("~")) {
    return filePath;
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (filePath === "~") {
    return home;
  }
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return path.join(home, filePath.slice(2));
  }
  return path.join(home, filePath.slice(1));
}

export function safeParseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function parseCsv(input) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseEnvCsv(input) {
  const out = {};
  for (const item of parseCsv(input)) {
    const eq = item.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = item.slice(0, eq).trim();
    const value = item.slice(eq + 1).trim();
    if (!key) {
      continue;
    }
    out[key] = value;
  }
  return out;
}
