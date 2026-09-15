/**
 * Alya AI Agent — Safety & Permissions Controls
 *
 * Enforces execution security:
 *  - Read-only actions execute automatically without prompt.
 *  - External side-effects (sending email, deleting files, pushing code, payments, publishing)
 *    require explicit user confirmation before execution.
 *  - Secret/credential isolation (model context never receives passwords, keys, or OAuth secrets).
 */

import { getRegisteredTool, ToolRiskLevel } from "./toolRegistry";

export interface SafetyCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  riskLevel: ToolRiskLevel;
  reason?: string;
}

const SENSITIVE_PATTERNS = [
  /send.*email/i,
  /send.*msg/i,
  /send.*message/i,
  /delete/i,
  /remove/i,
  /push.*github/i,
  /commit/i,
  /payment/i,
  /purchase/i,
  /financial/i,
  /billing/i,
  /transfer/i,
  /post.*tweet/i,
  /post.*social/i,
  /publish/i,
  /deploy/i,
  /drop.*database/i,
  /truncate/i,
  /overwrite/i,
  /create.*repo/i,
  /grant/i,
  /revoke/i,
  /update.*permission/i,
];

/**
 * Quick helper to check if a tool action is sensitive/destructive.
 */
export function isActionSensitive(toolId: string): boolean {
  const tool = getRegisteredTool(toolId);
  const isPatternSensitive = SENSITIVE_PATTERNS.some((p) => p.test(toolId));
  return (tool?.riskLevel === "sensitive" || tool?.riskLevel === "destructive") || isPatternSensitive;
}

/**
 * Check whether a tool action requires user confirmation.
 */
export function evaluateActionSafety(
  toolId: string,
  params?: Record<string, any>,
  userConfirmed = false
): SafetyCheckResult {
  // If user has already explicitly confirmed, allow execution
  if (userConfirmed) {
    return {
      allowed: true,
      requiresConfirmation: false,
      riskLevel: "sensitive",
    };
  }

  const tool = getRegisteredTool(toolId);
  const isPatternSensitive = SENSITIVE_PATTERNS.some((p) => p.test(toolId));
  const isSensitive = (tool?.riskLevel === "sensitive" || tool?.riskLevel === "destructive") || isPatternSensitive;

  if (isSensitive) {
    const actionLabel = tool?.name || toolId.replace(/_/g, " ");
    let targetDetail = "";
    if (params?.to) targetDetail = ` to ${params.to}`;
    else if (params?.recipient) targetDetail = ` to ${params.recipient}`;
    else if (params?.file || params?.path) targetDetail = ` on ${params.file || params.path}`;
    else if (params?.repo) targetDetail = ` in ${params.repo}`;

    return {
      allowed: false,
      requiresConfirmation: true,
      riskLevel: tool?.riskLevel || "sensitive",
      confirmationMessage: `Are you sure you want to execute "${actionLabel}"${targetDetail}? This action has external side-effects.`,
    };
  }

  return {
    allowed: true,
    requiresConfirmation: false,
    riskLevel: "read_only",
  };
}

/**
 * Sanitize parameters object to strip any accidental token, key, or password fields.
 */
export function sanitizeParameters(params: Record<string, any>): Record<string, any> {
  if (!params || typeof params !== "object") return {};

  const sanitized: Record<string, any> = {};
  const BLOCKED_KEYS = ["api_key", "apikey", "password", "secret", "token", "auth_token", "access_token", "cookie", "private_key"];

  for (const [key, value] of Object.entries(params)) {
    if (BLOCKED_KEYS.some((b) => key.toLowerCase().includes(b))) {
      sanitized[key] = "[REDACTED_SECRET]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeParameters(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
