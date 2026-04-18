import { createInterface } from "node:readline/promises";
import process from "node:process";

function looksRisky(action, riskyActions) {
  if (!action) {
    return false;
  }
  const normalized = String(action).toLowerCase();
  return riskyActions.some((risk) => normalized.includes(String(risk).toLowerCase()));
}

export function evaluateSafety({ stack, serverId, action }) {
  const server = stack.servers?.[serverId];
  if (!server || !server.enabled) {
    return { allow: false, reason: `Unknown or disabled server: ${serverId}` };
  }

  const mode = stack.safetyGate?.mode || "report";
  const level = server.safety?.level || "unknown";
  const riskyActions = server.safety?.riskyActions || [];
  const requireApproval = Boolean(server.safety?.requireApproval);
  const isHigh = level === "high";
  const actionRisky = looksRisky(action, riskyActions);
  const requiresApproval = requireApproval || (isHigh && stack.safetyGate?.highRiskRequiresApproval) || actionRisky;

  if (!stack.safetyGate?.enabled) {
    return { allow: true, reason: "Safety gate disabled" };
  }

  return {
    allow: mode === "report" || !requiresApproval,
    needsPrompt: mode === "prompt" && requiresApproval,
    requiresApproval,
    level,
    riskyActions,
    reason: requiresApproval ? "Approval required" : "Allowed"
  };
}

export async function promptApproval({ serverId, action, level }) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question(
      `[safety-gate] ${serverId} wants action \"${action}\" (risk: ${level}). Allow? [y/N]: `
    );
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

export async function guardAction({ stack, serverId, action }) {
  const check = evaluateSafety({ stack, serverId, action });
  if (!check.needsPrompt) {
    return check;
  }
  const allowed = await promptApproval({ serverId, action, level: check.level });
  return {
    ...check,
    allow: allowed,
    reason: allowed ? "Approved by user" : "Denied by user"
  };
}
