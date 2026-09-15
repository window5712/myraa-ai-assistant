/**
 * Alya Composio Integration — Agent Execution Context & Tool Registry
 * 
 * Manages per-turn session state, dynamic tool discovery caching, tool registries,
 * and action risk classification (READ vs WRITE vs DESTRUCTIVE).
 */

export type RiskLevel = "READ" | "WRITE" | "DESTRUCTIVE";

const DESTRUCTIVE_KEYWORDS = [
  "delete",
  "remove",
  "drop",
  "truncate",
  "revoke",
  "clear",
  "purge",
  "unlink",
];

const WRITE_KEYWORDS = [
  "create",
  "send",
  "update",
  "append",
  "post",
  "add",
  "modify",
  "put",
  "patch",
  "edit",
  "write",
  "upload",
  "commit",
  "push",
  "publish",
  "deploy",
  "share",
  "grant",
];

const READ_KEYWORDS = [
  "list",
  "search",
  "get",
  "read",
  "fetch",
  "query",
  "find",
  "about",
  "profile",
  "count",
  "status",
  "check",
  "inspect",
  "download",
];

/**
 * Classifies the risk level of an action tool slug or description.
 * READ operations (search, list, get) execute immediately.
 * WRITE and DESTRUCTIVE operations require user confirmation.
 */
export function classifyRiskLevel(actionName: string, description?: string): RiskLevel {
  const text = `${actionName} ${description || ""}`.toLowerCase();

  for (const kw of DESTRUCTIVE_KEYWORDS) {
    if (text.includes(kw)) return "DESTRUCTIVE";
  }

  for (const kw of WRITE_KEYWORDS) {
    if (text.includes(kw)) return "WRITE";
  }

  for (const kw of READ_KEYWORDS) {
    if (text.includes(kw)) return "READ";
  }

  return "READ";
}

export interface ToolRegistryEntry {
  discoveredToolSlug: string;
  toolkitSlug: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  requiresAuth: boolean;
  connectedAccount: string | null;
  riskLevel: RiskLevel;
  sessionId: string;
  discoveredAt: string;
}

/**
 * Server-side Tool Execution Registry keeping track of tools discovered in session.
 */
export class ToolExecutionRegistry {
  private static instance: ToolExecutionRegistry;
  private registry: Map<string, ToolRegistryEntry> = new Map();

  private constructor() {}

  public static getInstance(): ToolExecutionRegistry {
    if (!ToolExecutionRegistry.instance) {
      ToolExecutionRegistry.instance = new ToolExecutionRegistry();
    }
    return ToolExecutionRegistry.instance;
  }

  public registerTool(entry: ToolRegistryEntry): void {
    const slug = entry.discoveredToolSlug.toUpperCase();
    this.registry.set(slug, entry);
  }

  public getTool(slug: string): ToolRegistryEntry | undefined {
    return this.registry.get(slug.toUpperCase());
  }

  public hasTool(slug: string): boolean {
    return this.registry.has(slug.toUpperCase());
  }

  public listTools(): ToolRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  public countDiscoveredTools(): number {
    return this.registry.size;
  }

  public clear(): void {
    this.registry.clear();
  }
}

export const toolRegistry = ToolExecutionRegistry.getInstance();

/**
 * Per-turn Agent Execution Context created once per Gemini Live request/turn.
 */
export class AgentExecutionContext {
  public readonly userId: string;
  public readonly sessionId: string;
  public readonly session: any;
  public readonly conversationId: string;
  public readonly toolSearchCache: Map<string, any> = new Map();
  public readonly selectedAccounts: Map<string, string> = new Map();
  public lastToolSearch: string | null = null;
  public lastSuccessfulExecution: string | null = null;
  public lastFailedExecution: string | null = null;
  private turnLogged = false;

  constructor(userId = "aryan", sessionId = "", session: any = null, conversationId = "") {
    this.userId = userId;
    this.sessionId = sessionId;
    this.session = session;
    this.conversationId = conversationId || Math.random().toString(36).substring(2, 11);
  }

  public logTurnReady(): void {
    if (!this.turnLogged) {
      const redacted = this.sessionId.length > 8 ? `${this.sessionId.slice(0, 4)}***${this.sessionId.slice(-4)}` : this.sessionId || "active";
      console.log(`[Alya Composio] Session ready: ${this.userId} (session: ${redacted})`);
      this.turnLogged = true;
    }
  }

  public getCachedSearch(query: string): any | null {
    const key = query.toLowerCase().trim();
    return this.toolSearchCache.get(key) || null;
  }

  public setCachedSearch(query: string, result: any): void {
    const key = query.toLowerCase().trim();
    this.toolSearchCache.set(key, result);
    this.lastToolSearch = query;
  }
}
