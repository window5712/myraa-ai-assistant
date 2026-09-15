/**
 * Alya AI Agent — Unified Tool Registry & Safety Engine
 *
 * Manages metadata for tools across all 5 operational sources:
 *  - local: localhost local-agent / Electron desktop actions
 *  - playwright: Local Windows Chrome browser control via Playwright
 *  - composio: Cloud SaaS integrations (Gmail, GitHub, Drive, Slack, Facebook, etc.)
 *  - composio_browser: Cloud autonomous browser agent
 *  - gemini: Real-time screen vision & multi-modal analysis
 */

export type ToolSource = "local" | "playwright" | "composio" | "composio_browser" | "gemini";
export type RiskLevel = "read_only" | "sensitive";

export interface UnifiedTool {
  id: string;
  source: ToolSource;
  toolkitSlug: string;
  actionName: string;
  displayName: string;
  description: string;
  requiresAuth: boolean;
  riskLevel: RiskLevel;
  parameters?: Record<string, any>;
  timeoutMs: number;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
}

// Patterns for sensitive side-effect actions requiring explicit user confirmation
const SENSITIVE_ACTION_PATTERNS = [
  /send.*email/i,
  /send.*msg/i,
  /send.*message/i,
  /delete/i,
  /remove/i,
  /push/i,
  /commit/i,
  /payment/i,
  /purchase/i,
  /financial/i,
  /billing/i,
  /transfer/i,
  /post/i,
  /tweet/i,
  /publish/i,
  /deploy/i,
  /truncate/i,
  /overwrite/i,
  /grant/i,
  /revoke/i,
  /update.*permission/i,
  /create.*repo/i,
];

export function determineRiskLevel(actionName: string, description?: string): RiskLevel {
  const text = `${actionName} ${description || ""}`;
  return SENSITIVE_ACTION_PATTERNS.some((p) => p.test(text)) ? "sensitive" : "read_only";
}

export function isActionSensitive(actionName: string, description?: string): boolean {
  return determineRiskLevel(actionName, description) === "sensitive";
}

// In-memory Tool Registry state
const registeredTools = new Map<string, UnifiedTool>();

// Base Built-in Tools (Playwright local browser + local desktop)
const BUILT_IN_TOOLS: UnifiedTool[] = [
  {
    id: "playwright_browserOpen",
    source: "playwright",
    toolkitSlug: "personal_chrome",
    actionName: "browserOpen",
    displayName: "Open Webpage",
    description: "Opens a designated website URL in the user's personal Windows Chrome browser via Playwright.",
    requiresAuth: false,
    riskLevel: "read_only",
    timeoutMs: 20000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000 },
  },
  {
    id: "playwright_browserSearch",
    source: "playwright",
    toolkitSlug: "personal_chrome",
    actionName: "browserSearch",
    displayName: "Search In Browser",
    description: "Enters a query in the active website's search box inside personal Chrome.",
    requiresAuth: false,
    riskLevel: "read_only",
    timeoutMs: 10000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
  },
  {
    id: "playwright_browserClick",
    source: "playwright",
    toolkitSlug: "personal_chrome",
    actionName: "browserClick",
    displayName: "Click Element",
    description: "Clicks on an element or link inside the active personal browser page.",
    requiresAuth: false,
    riskLevel: "read_only",
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
  },
  {
    id: "playwright_browserType",
    source: "playwright",
    toolkitSlug: "personal_chrome",
    actionName: "browserType",
    displayName: "Type Text",
    description: "Types text into input fields in the personal Chrome browser.",
    requiresAuth: false,
    riskLevel: "read_only",
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
  },
  {
    id: "playwright_browserScroll",
    source: "playwright",
    toolkitSlug: "personal_chrome",
    actionName: "browserScroll",
    displayName: "Scroll Page",
    description: "Scrolls the personal browser viewport up or down.",
    requiresAuth: false,
    riskLevel: "read_only",
    timeoutMs: 3000,
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
  },
  {
    id: "playwright_browserTabAction",
    source: "playwright",
    toolkitSlug: "personal_chrome",
    actionName: "browserTabAction",
    displayName: "Manage Tabs",
    description: "Opens a new tab, closes a tab, or switches active tab in personal Chrome.",
    requiresAuth: false,
    riskLevel: "read_only",
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
  },
];

// Initialize built-in tools
BUILT_IN_TOOLS.forEach((t) => registeredTools.set(t.id, t));

export function registerTool(tool: UnifiedTool) {
  registeredTools.set(tool.id, tool);
}

export function registerComposioTools(rawTools: any[]): number {
  let addedCount = 0;
  for (const t of rawTools || []) {
    const actionName = t.name || t.slug || t.actionName;
    if (!actionName) continue;

    const toolkitSlug = (t.appName || t.toolkit || actionName.split("_")[0] || "composio").toLowerCase();
    const toolId = `composio_${actionName}`;
    const riskLevel = determineRiskLevel(actionName, t.description);

    registeredTools.set(toolId, {
      id: toolId,
      source: "composio",
      toolkitSlug,
      actionName,
      displayName: actionName.replace(/_/g, " "),
      description: t.description || `Execute ${actionName}`,
      requiresAuth: true,
      riskLevel,
      parameters: t.parameters || t.inputSchema || {},
      timeoutMs: 30000,
      retryPolicy: { maxRetries: 1, backoffMs: 1500 },
    });
    addedCount++;
  }
  return addedCount;
}

export function getRegisteredTools(): UnifiedTool[] {
  return Array.from(registeredTools.values());
}

export function searchToolsByQuery(query: string): UnifiedTool[] {
  const q = query.toLowerCase();
  return getRegisteredTools().filter(
    (t) =>
      t.actionName.toLowerCase().includes(q) ||
      t.toolkitSlug.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.displayName.toLowerCase().includes(q)
  );
}

export function getToolsBySource(source: ToolSource): UnifiedTool[] {
  return getRegisteredTools().filter((t) => t.source === source);
}
