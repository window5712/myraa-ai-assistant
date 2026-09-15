/**
 * Alya AI Agent — Unified Tool Registry
 *
 * Registers and metadata-tags all executable capabilities:
 *  - Source domain: LOCAL_COMPUTER, PERSONAL_BROWSER, COMPOSIO_APP, COMPOSIO_BROWSER, GEMINI_VISION
 *  - Risk level: read_only, sensitive, destructive
 *  - Authentication & session requirements
 *  - Timeout & retry policies
 */

export type ToolSource = "local" | "playwright" | "composio" | "composio_browser" | "vision";
export type ToolRiskLevel = "read_only" | "sensitive" | "destructive";

export interface RegisteredTool {
  id: string;                      // Tool slug / action name
  name: string;                    // Human-readable title
  source: ToolSource;
  appName: string;                 // e.g. "gmail", "github", "playwright", "system"
  description: string;
  riskLevel: ToolRiskLevel;
  authRequired: boolean;
  timeoutMs: number;
  retryable: boolean;
  version?: string;
}

const TOOL_CATALOG: RegisteredTool[] = [
  // ── 1. PERSONAL BROWSER TOOLS (Playwright Local Chrome) ─────────────────
  {
    id: "browserOpen",
    name: "Open Website / URL",
    source: "playwright",
    appName: "personal_chrome",
    description: "Opens a designated website or URL in the user's personal Playwright Chrome browser.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 25000,
    retryable: true,
  },
  {
    id: "browserSearch",
    name: "Search Active Webpage",
    source: "playwright",
    appName: "personal_chrome",
    description: "Performs a search query inside Google, YouTube, or the active page.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 15000,
    retryable: true,
  },
  {
    id: "browserClick",
    name: "Click Element",
    source: "playwright",
    appName: "personal_chrome",
    description: "Clicks a targeted button, link, or video result on the active webpage.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 15000,
    retryable: true,
  },
  {
    id: "browserType",
    name: "Type Text into Field",
    source: "playwright",
    appName: "personal_chrome",
    description: "Enters typed letters into an active input container.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 15000,
    retryable: true,
  },
  {
    id: "browserScroll",
    name: "Scroll Viewport",
    source: "playwright",
    appName: "personal_chrome",
    description: "Scrolls the active webpage vertically up or down.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 10000,
    retryable: true,
  },
  {
    id: "browserGoBack",
    name: "Navigate Back",
    source: "playwright",
    appName: "personal_chrome",
    description: "Navigates back to the previous webpage in browser history.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 10000,
    retryable: true,
  },
  {
    id: "browserTabAction",
    name: "Manage Tabs",
    source: "playwright",
    appName: "personal_chrome",
    description: "Opens a new tab, closes a tab, or switches active tab index.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 10000,
    retryable: true,
  },
  {
    id: "browserMediaControl",
    name: "Media Player Control",
    source: "playwright",
    appName: "personal_chrome",
    description: "Controls play, pause, volume, mute, skip, and fullscreen on media streams.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 10000,
    retryable: true,
  },
  {
    id: "browserReadPage",
    name: "Read Webpage Content",
    source: "playwright",
    appName: "personal_chrome",
    description: "Extracts text content and structured elements from the active webpage for analysis.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 15000,
    retryable: true,
  },

  // ── 2. LOCAL COMPUTER & SYSTEM TOOLS ───────────────────────────────────
  {
    id: "saveCustomMemory",
    name: "Save Custom Memory",
    source: "local",
    appName: "alya_memory",
    description: "Saves user preferences, projects, goals, or workflows into Alya's memory core.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 5000,
    retryable: true,
  },
  {
    id: "changeBackground",
    name: "Change Theme Color",
    source: "local",
    appName: "alya_ui",
    description: "Changes the visual atmospheric glow theme of Alya's interface.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 5000,
    retryable: true,
  },

  // ── 3. COMPOSIO CLOUD BROWSER TOOL ──────────────────────────────────────
  {
    id: "COMPOSIO_BROWSER_TASK",
    name: "Composio Cloud Browser Task",
    source: "composio_browser",
    appName: "composio_browser",
    description: "Launches an autonomous cloud browser session for non-personal web automation tasks.",
    riskLevel: "read_only",
    authRequired: true,
    timeoutMs: 60000,
    retryable: true,
  },

  // ── 4. GEMINI SCREEN VISION ─────────────────────────────────────────────
  {
    id: "screenVisionAnalyze",
    name: "Screen Vision Frame Analysis",
    source: "vision",
    appName: "screen_sharing",
    description: "Analyzes live shared screen video frames to answer questions about visual content.",
    riskLevel: "read_only",
    authRequired: false,
    timeoutMs: 10000,
    retryable: true,
  },
];

/**
 * Find tool metadata by action ID.
 */
export function getRegisteredTool(toolId: string): RegisteredTool | null {
  const found = TOOL_CATALOG.find((t) => t.id === toolId);
  if (found) return found;

  // Dynamic Composio Tool classification if not statically listed
  if (toolId.startsWith("GMAIL_") || toolId.startsWith("GITHUB_") || toolId.startsWith("SLACK_") || toolId.includes("_")) {
    const appName = toolId.split("_")[0].toLowerCase();
    const isSensitive = /send|delete|push|commit|payment|remove|create|publish|post/i.test(toolId);
    return {
      id: toolId,
      name: toolId.replace(/_/g, " "),
      source: "composio",
      appName,
      description: `Composio action for ${appName.toUpperCase()}`,
      riskLevel: isSensitive ? "sensitive" : "read_only",
      authRequired: true,
      timeoutMs: 30000,
      retryable: true,
    };
  }

  return null;
}

/**
 * List all registered static tools.
 */
export function listRegisteredTools(): RegisteredTool[] {
  return [...TOOL_CATALOG];
}
