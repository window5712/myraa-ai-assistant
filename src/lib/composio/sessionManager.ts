import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { toolRegistry, classifyRiskLevel, ToolRegistryEntry } from "./agentContext";

/**
 * ComposioSessionManager
 * 
 * Central manager for Composio integration in Alya AI Assistant.
 * Uses @composio/core v0.16+ Session API.
 * 
 * Responsibilities:
 *  - Maintain single stable entity/user session ("aryan")
 *  - Per-user mutex locking to prevent duplicate concurrent session creation
 *  - Connected account normalization, deduplication & canonical account selection
 *  - META_TOOL vs APP_TOOL routing
 *  - Generic toolkit readiness & recovery loop (ensureToolkitReady)
 *  - Session tool discovery & accurate toolCount reporting
 *  - Diagnostic health status reporting
 *  - Redacted, structured clean logging
 */

export interface ExecutionRecord {
  id: string;
  tool: string;
  app: string;
  status: "success" | "error" | "pending" | "awaiting_confirmation";
  summary: string;
  timestamp: string;
  durationMs?: number;
  data?: any;
  error?: string;
  accountId?: string;
}

export interface ConnectedAccountRecord {
  id: string;
  toolkitSlug: string;
  name: string;
  status: "connected" | "disconnected" | "expired";
  rawStatus: string;
  connected: boolean;
  userId: string;
  connectedAccountId: string;
  displayConnectedAccountId: string;
  updatedAt: string;
  createdAt: string;
}

export interface GroupedApp {
  toolkitSlug: string;
  name: string;
  status: "connected" | "disconnected" | "expired";
  connected: boolean;
  activeAccounts: ConnectedAccountRecord[];
  expiredAccounts: ConnectedAccountRecord[];
  selectedAccountId: string | null;
  toolCount: number;
  availableTools: string[];
}

export interface SearchToolsResult {
  useCase: string;
  primaryToolSlugs: string[];
  relatedToolSlugs: string[];
  guidance?: string;
}

export interface ExecuteActionResult {
  success: boolean;
  data?: any;
  items?: any[];
  count?: number;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  redirectUrl?: string;
  toolkitSlug?: string;
  toolSlug?: string;
  connectedAccountId?: string;
  durationMs?: number;
}

export interface HealthStatus {
  sdkVersion: string;
  clientInitialized: boolean;
  entityId: string;
  sessionReady: boolean;
  sessionIdRedacted: string | null;
  catalogToolCount: number;
  sessionMetaToolCount: number;
  taskDiscoveredToolCount: number;
  activeToolkits: string[];
  expiredToolkits: string[];
  toolkitsRequiringAuth: string[];
  activeAccountCount: number;
  expiredAccountCount: number;
  discoveredApplicationToolCount: number;
  lastDiscoveryError: string | null;
  lastExecutionError: string | null;
  lastSuccessfulExecution: string | null;
  lastToolSearch: string | null;
  timestamp: string;
}

// Sensitive action patterns requiring explicit user confirmation
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

export function isActionSensitive(actionName: string, description?: string): boolean {
  const text = `${actionName} ${description || ""}`;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function formatToolkitTitle(slug: string): string {
  if (!slug || slug === "unknown") return "Connected App";
  const lower = slug.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const MAPPINGS: Record<string, string> = {
    gmail: "Gmail",
    github: "GitHub",
    slack: "Slack",
    notion: "Notion",
    googlecalendar: "Google Calendar",
    google_calendar: "Google Calendar",
    googledrive: "Google Drive",
    google_drive: "Google Drive",
    googlesheets: "Google Sheets",
    google_sheets: "Google Sheets",
    facebook: "Facebook",
    twitter: "Twitter / X",
    x: "Twitter / X",
    discord: "Discord",
    linear: "Linear",
    jira: "Jira",
    hubspot: "HubSpot",
  };

  if (MAPPINGS[lower]) return MAPPINGS[lower];

  return slug
    .split(/_|-/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeToolParams(actionName: string, params: Record<string, any>): Record<string, any> {
  const cleanParams: Record<string, any> = { ...params };

  // Remove metadata & system fields from payload that break tool schema validation
  delete cleanParams.connectedAccountId;
  delete cleanParams.connected_account_id;
  delete cleanParams._dependencyData;

  const upper = (actionName || "").toUpperCase();

  // Facebook Post parameters mapping
  if (upper === "FACEBOOK_CREATE_POST" || upper === "FACEBOOK_CREATE_PHOTO_POST" || upper === "FACEBOOK_CREATE_VIDEO_POST") {
    if (!cleanParams.page_id && (cleanParams.pageId || cleanParams.page_ID || cleanParams.page)) {
      cleanParams.page_id = String(cleanParams.pageId || cleanParams.page_ID || cleanParams.page);
    }
    if (cleanParams.page_id) {
      cleanParams.page_id = String(cleanParams.page_id);
    }
    if (!cleanParams.message && (cleanParams.text || cleanParams.content || cleanParams.body || cleanParams.post || cleanParams.status || cleanParams.caption)) {
      cleanParams.message = String(cleanParams.text || cleanParams.content || cleanParams.body || cleanParams.post || cleanParams.status || cleanParams.caption);
    }
    if (!cleanParams.link && cleanParams.url) {
      cleanParams.link = String(cleanParams.url);
    }
  }

  // LinkedIn Post parameters mapping
  if (upper === "LINKEDIN_CREATE_POST" || upper === "LINKEDIN_CREATE_COMPANY_POST" || upper === "LINKEDIN_SHARE_POST") {
    if (!cleanParams.text && (cleanParams.message || cleanParams.content || cleanParams.body || cleanParams.post)) {
      cleanParams.text = String(cleanParams.message || cleanParams.content || cleanParams.body || cleanParams.post);
    }
    if (!cleanParams.author && (cleanParams.author_id || cleanParams.authorId || cleanParams.urn || cleanParams.authorUrn)) {
      cleanParams.author = String(cleanParams.author_id || cleanParams.authorId || cleanParams.urn || cleanParams.authorUrn);
    }
  }

  // Twitter / X parameters mapping
  if (upper.includes("TWITTER_CREATE") || upper.includes("TWITTER_POST") || upper.includes("TWEET")) {
    if (!cleanParams.text && (cleanParams.message || cleanParams.content || cleanParams.body || cleanParams.status || cleanParams.tweet)) {
      cleanParams.text = String(cleanParams.message || cleanParams.content || cleanParams.body || cleanParams.status || cleanParams.tweet);
    }
  }

  // Gmail Send Email parameters mapping
  if (upper === "GMAIL_SEND_EMAIL" || upper === "GMAIL_CREATE_DRAFT") {
    if (!cleanParams.recipient_email && (cleanParams.to || cleanParams.recipient || cleanParams.email || cleanParams.to_email)) {
      cleanParams.recipient_email = String(cleanParams.to || cleanParams.recipient || cleanParams.email || cleanParams.to_email);
    }
    if (!cleanParams.body && (cleanParams.message || cleanParams.content || cleanParams.text)) {
      cleanParams.body = String(cleanParams.message || cleanParams.content || cleanParams.text);
    }
  }

  return cleanParams;
}

class ComposioSessionManager {
  private static instance: ComposioSessionManager;
  private composioClient: any = null;
  private sessionMap: Map<string, any> = new Map();
  private sessionLockMap: Map<string, Promise<any>> = new Map();
  private selectedAccountMap: Map<string, Map<string, string>> = new Map(); // userId -> (toolkitSlug -> accountId)
  private executionHistory: ExecutionRecord[] = [];
  private lastDiscoveryError: string | null = null;
  private lastExecutionError: string | null = null;
  private lastSuccessfulExecution: string | null = null;
  private lastToolSearch: string | null = null;
  private recoveryAttemptCount: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): ComposioSessionManager {
    if (!ComposioSessionManager.instance) {
      ComposioSessionManager.instance = new ComposioSessionManager();
    }
    return ComposioSessionManager.instance;
  }

  public getSDKVersion(): string {
    return "0.16.0";
  }

  public async getClient(): Promise<any> {
    if (this.composioClient) return this.composioClient;

    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      console.warn("[Alya Composio] COMPOSIO_API_KEY not set — Composio tools disabled.");
      return null;
    }

    try {
      const composioMod = await import("@composio/core");
      const ComposioClass =
        (composioMod as any).Composio ||
        (composioMod as any).ComposioToolSet ||
        (composioMod as any).default?.Composio ||
        (composioMod as any).default?.ComposioToolSet;

      if (!ComposioClass) throw new Error("Neither Composio nor ComposioToolSet found in @composio/core");
      this.composioClient = new ComposioClass({ apiKey });
      console.log("[Alya Composio] Client initialized successfully.");
      return this.composioClient;
    } catch (err: any) {
      console.error("[Alya Composio] Failed to initialize SDK client:", err.message);
      return null;
    }
  }

  /**
   * Obtain or create single user-scoped session for an entity ID (default: "aryan").
   * Thread-safe with per-user mutex lock.
   */
  public async getOrCreateSession(userId = process.env.COMPOSIO_ENTITY_ID || "aryan", forceRefresh = false): Promise<any> {
    if (!forceRefresh && this.sessionMap.has(userId)) {
      // Quietly return cached session without spamming logs
      return this.sessionMap.get(userId);
    }

    // Mutex lock to avoid parallel session creation calls for the same user
    if (this.sessionLockMap.has(userId)) {
      return await this.sessionLockMap.get(userId);
    }

    const lockPromise = (async () => {
      try {
        const client = await this.getClient();
        if (!client) return null;

        let session: any = null;

        if (client.sessions?.create && typeof client.sessions.create === "function") {
          session = await client.sessions.create(userId);
        } else if (typeof client.create === "function") {
          session = await client.create(userId);
        } else if (client.sessions?.get && typeof client.sessions.get === "function") {
          session = await client.sessions.get(userId);
        }

        if (session) {
          this.sessionMap.set(userId, session);
          const sId = session.sessionId || session.id || "active";
          const redacted = sId.length > 8 ? `${sId.slice(0, 4)}***${sId.slice(-4)}` : sId;
          console.log(`[Alya Composio] Session ready: ${userId} (session: ${redacted})`);
          return session;
        }

        throw new Error("Unable to create Composio session using available SDK methods.");
      } catch (err: any) {
        console.error(`[Alya Composio] Failed creating session for ${userId}:`, err.message);
        this.lastDiscoveryError = err.message;
        return null;
      } finally {
        this.sessionLockMap.delete(userId);
      }
    })();

    this.sessionLockMap.set(userId, lockPromise);
    return await lockPromise;
  }

  public async refreshSession(userId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<any> {
    console.log(`[Alya Composio] Refreshing session for: ${userId}`);
    this.sessionMap.delete(userId);
    return await this.getOrCreateSession(userId, true);
  }

  public async destroySession(userId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<boolean> {
    try {
      const session = this.sessionMap.get(userId);
      if (session && typeof session.delete === "function") {
        await session.delete();
      }
      this.sessionMap.delete(userId);
      console.log(`[Alya Composio] Session destroyed: ${userId}`);
      return true;
    } catch (err: any) {
      console.warn(`[Alya Composio] Destroy session error for ${userId}:`, err.message);
      this.sessionMap.delete(userId);
      return false;
    }
  }

  /**
   * Raw list of all connected account records for user
   */
  public async getRawConnectedAccounts(userId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<ConnectedAccountRecord[]> {
    const client = await this.getClient();
    if (!client) return [];

    try {
      let rawAccounts: any[] = [];

      if (client.connectedAccounts?.list) {
        try {
          const res = await client.connectedAccounts.list({ userUuid: userId });
          rawAccounts = res?.items || res?.data || (Array.isArray(res) ? res : []);
        } catch (e: any) {
          try {
            const res = await client.connectedAccounts.list();
            rawAccounts = res?.items || res?.data || (Array.isArray(res) ? res : []);
          } catch (e2: any) {}
        }
      }

      if (rawAccounts.length === 0 && typeof client.getEntity === "function") {
        try {
          const entity = await client.getEntity(userId);
          if (typeof entity.getConnections === "function") {
            rawAccounts = (await entity.getConnections()) || [];
          }
        } catch (e: any) {}
      }

      const records: ConnectedAccountRecord[] = rawAccounts.map((conn: any) => {
        const rawSlug =
          conn.toolkit?.slug ||
          conn.appName ||
          (conn.wordId ? String(conn.wordId).split("_")[0] : null) ||
          conn.appUniqueId ||
          conn.slug ||
          conn.app ||
          "integration";

        const slug = String(rawSlug).toLowerCase().replace(/[^a-z0-9_]/g, "");
        const displayName = formatToolkitTitle(slug);
        const statusRaw = String(conn.status || "").toUpperCase();

        const isConn = statusRaw === "ACTIVE" || statusRaw === "CONNECTED" || conn.status === true;
        const isExp = statusRaw === "EXPIRED" || statusRaw === "INACTIVE" || statusRaw === "REVOKED";

        const connId = String(conn.id || conn.connectionId || conn.connectedAccountId || `conn_${slug}`);
        const redactedId = connId.length > 8 ? `${connId.slice(0, 4)}***${connId.slice(-4)}` : connId;
        const updatedAt = conn.updatedAt || conn.createdAt || new Date().toISOString();
        const createdAt = conn.createdAt || updatedAt;

        return {
          id: connId,
          toolkitSlug: slug,
          name: displayName,
          status: isConn ? "connected" : isExp ? "expired" : "disconnected",
          rawStatus: statusRaw,
          connected: isConn,
          userId: conn.userId || userId,
          connectedAccountId: connId,
          displayConnectedAccountId: redactedId,
          updatedAt,
          createdAt,
        };
      });

      records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return records;
    } catch (err: any) {
      console.error(`[Alya Composio] Failed fetching raw connected accounts:`, err.message);
      return [];
    }
  }

  /**
   * Group connected accounts by toolkit slug for UI & account management.
   */
  public async getGroupedConnectedApps(userId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<GroupedApp[]> {
    const rawAccounts = await this.getRawConnectedAccounts(userId);

    const groupedMap = new Map<string, { active: ConnectedAccountRecord[]; expired: ConnectedAccountRecord[]; name: string }>();

    for (const acc of rawAccounts) {
      const slug = acc.toolkitSlug;
      if (!groupedMap.has(slug)) {
        groupedMap.set(slug, { active: [], expired: [], name: acc.name });
      }
      const entry = groupedMap.get(slug)!;
      if (acc.connected) {
        entry.active.push(acc);
      } else {
        entry.expired.push(acc);
      }
    }

    const discoveredToolsMap = await this.discoverToolsPerToolkit(userId);
    const groupedApps: GroupedApp[] = [];

    for (const [slug, group] of groupedMap.entries()) {
      const activeCount = group.active.length;
      const expiredCount = group.expired.length;

      const isConnected = activeCount > 0;
      const isExpired = !isConnected && expiredCount > 0;
      const status: "connected" | "expired" | "disconnected" = isConnected
        ? "connected"
        : isExpired
        ? "expired"
        : "disconnected";

      const selectedAccountId = this.selectConnectedAccount(userId, slug, null, group.active);
      const availableTools = discoveredToolsMap.get(slug) || [];
      const toolCount = availableTools.length;

      groupedApps.push({
        toolkitSlug: slug,
        name: group.name,
        status,
        connected: isConnected,
        activeAccounts: group.active,
        expiredAccounts: group.expired,
        selectedAccountId,
        toolCount,
        availableTools,
      });
    }

    groupedApps.sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return groupedApps;
  }

  private discoveryCacheMap: Map<string, { data: Map<string, string[]>; timestamp: number }> = new Map();

  public async discoverToolsPerToolkit(userId = process.env.COMPOSIO_ENTITY_ID || "aryan", forceRefresh = false): Promise<Map<string, string[]>> {
    const cached = this.discoveryCacheMap.get(userId);
    const now = Date.now();
    if (!forceRefresh && cached && now - cached.timestamp < 60000) {
      return cached.data;
    }

    const toolkitToolsMap = new Map<string, string[]>();
    const session = await this.getOrCreateSession(userId);
    if (!session) return toolkitToolsMap;

    try {
      const rawAccounts = await this.getRawConnectedAccounts(userId);
      const activeSlugs = Array.from(new Set(rawAccounts.filter((a) => a.connected).map((a) => a.toolkitSlug)));

      for (const slug of activeSlugs) {
        try {
          const searchRes = await this.searchToolsInSession(userId, slug);
          const primary = searchRes?.primaryToolSlugs || [];
          const related = searchRes?.relatedToolSlugs || [];
          const combined = Array.from(new Set([...primary, ...related]));
          toolkitToolsMap.set(slug, combined);
        } catch (e: any) {}
      }
      this.discoveryCacheMap.set(userId, { data: toolkitToolsMap, timestamp: now });
    } catch (err: any) {}

    return toolkitToolsMap;
  }

  public selectConnectedAccount(
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan",
    toolkitSlug: string,
    requestedAccountId?: string | null,
    preFilteredActiveAccounts?: ConnectedAccountRecord[]
  ): string | null {
    const slug = toolkitSlug.toLowerCase();
    const activeAccounts = preFilteredActiveAccounts || [];

    if (requestedAccountId && activeAccounts.some((a) => a.id === requestedAccountId)) {
      return requestedAccountId;
    }

    const userPrefs = this.selectedAccountMap.get(userId);
    if (userPrefs && userPrefs.has(slug)) {
      const prefId = userPrefs.get(slug)!;
      if (activeAccounts.some((a) => a.id === prefId)) {
        return prefId;
      }
    }

    if (activeAccounts.length > 0) {
      return activeAccounts[0].id;
    }

    return null;
  }

  public setSelectedAccount(userId = process.env.COMPOSIO_ENTITY_ID || "aryan", toolkitSlug: string, accountId: string): void {
    if (!this.selectedAccountMap.has(userId)) {
      this.selectedAccountMap.set(userId, new Map());
    }
    this.selectedAccountMap.get(userId)!.set(toolkitSlug.toLowerCase(), accountId);
    console.log(`[Alya Composio] Account selected for ${toolkitSlug}: ${accountId}`);
  }

  public async initiateAppConnection(
    appName: string,
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan"
  ): Promise<{ redirectUrl?: string; connectionId?: string; error?: string }> {
    const slug = appName.toLowerCase().replace(/[^a-z0-9_]/g, "");
    console.log(`[Alya Composio] Authentication: REQUIRED (${slug})`);

    try {
      const session = await this.getOrCreateSession(userId);

      if (session && typeof session.authorize === "function") {
        try {
          const authRes = await session.authorize(slug);
          const redirectUrl = authRes?.redirectUrl || authRes?.url || authRes?.redirect_url;
          const connectionId = authRes?.id || authRes?.connectionId;
          if (redirectUrl) {
            return { redirectUrl, connectionId };
          }
        } catch (err: any) {}
      }

      const client = await this.getClient();
      if (client?.connectedAccounts?.initiate) {
        const connection = await client.connectedAccounts.initiate({ appName: slug, userUuid: userId });
        const redirectUrl = connection?.redirectUrl || connection?.url || connection?.redirect_url;
        return { redirectUrl, connectionId: connection?.connectionId || connection?.id };
      }

      if (client?.connectedAccounts?.link) {
        const connection = await client.connectedAccounts.link({ toolkit: slug, userUuid: userId });
        const redirectUrl = connection?.redirectUrl || connection?.url || connection?.redirect_url;
        return { redirectUrl, connectionId: connection?.connectionId || connection?.id };
      }

      throw new Error(`No compatible authorization method available for toolkit "${slug}".`);
    } catch (err: any) {
      console.error(`[Alya Composio] Failed initiating connection for ${slug}:`, err.message);
      return { error: err.message };
    }
  }

  public async disconnectAppConnection(connectedAccountId: string): Promise<{ success: boolean; error?: string }> {
    const client = await this.getClient();
    if (!client) return { success: false, error: "Composio client not initialized." };

    try {
      if (client.connectedAccounts?.delete) {
        await client.connectedAccounts.delete({ connectedAccountId });
        console.log(`[Alya Composio] Disconnected account: ${connectedAccountId}`);
        return { success: true };
      }
      throw new Error("Connected accounts delete method not available.");
    } catch (err: any) {
      console.error(`[Alya Composio] Disconnect account ${connectedAccountId} error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  public async ensureToolkitReady(
    toolkitSlug: string,
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan"
  ): Promise<{ ready: boolean; selectedAccountId?: string; redirectUrl?: string; error?: string }> {
    const slug = toolkitSlug.toLowerCase();
    const key = `${userId}:${slug}`;
    const attempts = this.recoveryAttemptCount.get(key) || 0;

    if (attempts >= 2) {
      console.warn(`[Alya Composio] Maximum recovery attempts (2) reached for toolkit "${slug}".`);
      this.recoveryAttemptCount.delete(key);
      return {
        ready: false,
        error: `Toolkit "${slug}" requires authentication. Please authorize connection in Apps settings.`,
      };
    }

    this.recoveryAttemptCount.set(key, attempts + 1);

    const rawAccounts = await this.getRawConnectedAccounts(userId);
    const activeAccounts = rawAccounts.filter((a) => a.toolkitSlug === slug && a.connected);

    if (activeAccounts.length === 0) {
      console.log(`[Alya Composio] Authentication: REQUIRED (${slug})`);
      const conn = await this.initiateAppConnection(slug, userId);
      return {
        ready: false,
        redirectUrl: conn.redirectUrl,
        error: conn.redirectUrl
          ? `Your ${formatToolkitTitle(slug)} connection needs to be authorized again. Click the link to sign in.`
          : `No active connection found for toolkit "${slug}".`,
      };
    }

    const selectedAccountId = this.selectConnectedAccount(userId, slug, null, activeAccounts);
    if (!selectedAccountId) {
      const conn = await this.initiateAppConnection(slug, userId);
      return {
        ready: false,
        redirectUrl: conn.redirectUrl,
        error: `No usable active connection found for ${formatToolkitTitle(slug)}.`,
      };
    }

    this.recoveryAttemptCount.delete(key);
    console.log(`[Alya Composio] Authentication: ACTIVE (${slug}:${selectedAccountId})`);
    return { ready: true, selectedAccountId };
  }

  public async searchToolsInSession(
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan",
    query: string
  ): Promise<SearchToolsResult | null> {
    this.lastToolSearch = query;
    console.log(`[Alya Composio] Searching tools: "${query}"`);

    const session = await this.getOrCreateSession(userId);
    if (!session) return null;

    try {
      if (typeof session.search === "function") {
        try {
          const searchRes = await session.search({ query });
          const primarySlugs: string[] = [];
          const relatedSlugs: string[] = [];

          if (searchRes?.results && Array.isArray(searchRes.results)) {
            for (const item of searchRes.results) {
              if (Array.isArray(item.primaryToolSlugs)) {
                primarySlugs.push(...item.primaryToolSlugs);
              }
              if (Array.isArray(item.relatedToolSlugs)) {
                relatedSlugs.push(...item.relatedToolSlugs);
              }
            }
          }

          if (primarySlugs.length === 0 && searchRes?.toolSchemas) {
            primarySlugs.push(...Object.keys(searchRes.toolSchemas));
          }

          if (primarySlugs.length === 0 && searchRes?.tools && Array.isArray(searchRes.tools)) {
            const rawTools = searchRes.tools.map((t: any) => t.slug || t.name || t.tool_slug).filter(Boolean);
            primarySlugs.push(...rawTools);
          }

          if (primarySlugs.length > 0 || relatedSlugs.length > 0) {
            console.log(`[Alya Composio] Tool discovered: ${primarySlugs[0] || relatedSlugs[0]}`);
            return {
              useCase: query,
              primaryToolSlugs: primarySlugs,
              relatedToolSlugs: relatedSlugs,
              guidance: searchRes?.nextStepsGuidance?.[0] || "",
            };
          }
        } catch (e: any) {
          console.warn(`[Alya Composio] session.search error for "${query}":`, e.message);
        }
      }

      if (typeof session.execute === "function") {
        const res = await session.execute("COMPOSIO_SEARCH_TOOLS", { query });
        const results = res?.data?.results || res?.results || [];
        if (results.length > 0) {
          const top = results[0];
          const primary = top.primary_tool_slugs || [];
          if (primary.length > 0) {
            console.log(`[Alya Composio] Tool discovered: ${primary[0]}`);
          }
          return {
            useCase: top.use_case || query,
            primaryToolSlugs: primary,
            relatedToolSlugs: top.related_tool_slugs || [],
            guidance: top.execution_guidance || "",
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Alya Composio] Search notice for "${query}":`, err.message);
    }

    return null;
  }

  /**
   * Helper function to extract array items from raw tool output payload
   */
  private extractResultItems(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (payload.data) {
      if (Array.isArray(payload.data)) return payload.data;
      if (payload.data.data && Array.isArray(payload.data.data)) return payload.data.data;
      if (typeof payload.data === "object") {
        for (const key of ["messages", "files", "items", "repositories", "repos", "pages", "rows", "values", "threads", "events"]) {
          if (Array.isArray(payload.data[key])) return payload.data[key];
        }
      }
    }
    for (const key of ["messages", "files", "items", "repositories", "repos", "pages", "rows", "values", "threads", "events", "results"]) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
  }

  public async executeTool(
    actionName: string,
    params: Record<string, any> = {},
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan",
    skipConfirmationCheck = false
  ): Promise<ExecuteActionResult> {
    const startTime = Date.now();
    const cleanActionName = (actionName || "").trim();
    const upperAction = cleanActionName.toUpperCase();

    if (upperAction.startsWith("COMPOSIO_") || upperAction === "META_TOOL") {
      return await this.executeMetaTool(cleanActionName, params, userId);
    }

    const rawToolkitSlug = cleanActionName.split("_")[0] || "composio";
    const toolkitSlug = rawToolkitSlug.toLowerCase().replace(/[^a-z0-9]/g, "");

    const riskLevel = classifyRiskLevel(cleanActionName);

    // Require confirmation for WRITE and DESTRUCTIVE operations unless pre-confirmed
    if (!skipConfirmationCheck && riskLevel !== "READ" && isActionSensitive(cleanActionName)) {
      return {
        success: false,
        requiresConfirmation: true,
        confirmationMessage: `Action "${cleanActionName}" is a ${riskLevel} operation. Do you confirm executing this task?`,
        toolkitSlug,
        toolSlug: cleanActionName,
      };
    }

    const readyCheck = await this.ensureToolkitReady(toolkitSlug, userId);
    if (!readyCheck.ready) {
      return {
        success: false,
        error: readyCheck.error,
        redirectUrl: readyCheck.redirectUrl,
        toolkitSlug,
        toolSlug: cleanActionName,
      };
    }

    const selectedAccountId = readyCheck.selectedAccountId;
    const execParams = normalizeToolParams(cleanActionName, params);

    try {
      console.log(`[Alya Composio] Executing: ${cleanActionName}`);
      const session = await this.getOrCreateSession(userId);
      if (!session) {
        throw new Error("Failed establishing Composio user session.");
      }

      let result: any = null;
      if (typeof session.execute === "function") {
        try {
          const opts = selectedAccountId ? { account: selectedAccountId } : undefined;
          result = await session.execute(cleanActionName, execParams, opts);
        } catch (execErr: any) {
          const msg = execErr.message || "";
          if (
            msg.includes("account' parameter is not supported") ||
            msg.includes("Multi-account selection is not enabled") ||
            msg.includes("4300")
          ) {
            console.log(`[Alya Composio] Single-account mode active — executing ${cleanActionName} without account option.`);
            result = await session.execute(cleanActionName, execParams);
          } else {
            throw execErr;
          }
        }
      } else {
        const client = await this.getClient();
        if (client?.tools?.execute) {
          result = await client.tools.execute(cleanActionName, execParams);
        } else {
          throw new Error("No compatible tool execution interface found on Composio session.");
        }
      }

      const durationMs = Date.now() - startTime;
      const items = this.extractResultItems(result);
      console.log(`[Alya Composio] Result received: success (${items.length > 0 ? `${items.length} items` : "payload"})`);

      this.lastSuccessfulExecution = cleanActionName;

      this.addExecutionRecord({
        tool: cleanActionName,
        app: toolkitSlug,
        status: "success",
        summary: `Executed ${cleanActionName} successfully`,
        timestamp: new Date().toISOString(),
        durationMs,
        data: result,
        accountId: selectedAccountId || undefined,
      });

      return {
        success: true,
        data: result,
        items,
        count: items.length,
        toolkitSlug,
        toolSlug: cleanActionName,
        connectedAccountId: selectedAccountId || undefined,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.message || "";
      this.lastExecutionError = errorMsg;

      console.error(`[Alya Composio] Execution failed: ${cleanActionName} — ${errorMsg}`);

      this.addExecutionRecord({
        tool: cleanActionName,
        app: toolkitSlug,
        status: "error",
        summary: `Failed: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        durationMs,
        error: errorMsg,
        accountId: selectedAccountId || undefined,
      });

      if (
        errorMsg.includes("No active connection") ||
        errorMsg.includes("NoActiveConnection") ||
        errorMsg.includes("ConnectionExpired") ||
        errorMsg.includes("4302")
      ) {
        console.log(`[Alya Composio] Active connection missing for ${toolkitSlug}. Generating OAuth sign-in link...`);
        await this.refreshSession(userId);
        const conn = await this.initiateAppConnection(toolkitSlug, userId);
        return {
          success: false,
          error: `Connection to ${formatToolkitTitle(toolkitSlug)} is missing or expired. Authorization link opened.`,
          redirectUrl: conn.redirectUrl,
          toolkitSlug,
          toolSlug: cleanActionName,
          durationMs,
        };
      }

      return {
        success: false,
        error: errorMsg,
        toolkitSlug,
        toolSlug: cleanActionName,
        durationMs,
      };
    }
  }

  private async executeMetaTool(
    actionName: string,
    params: Record<string, any>,
    userId: string
  ): Promise<ExecuteActionResult> {
    const upper = actionName.toUpperCase();

    if (upper === "COMPOSIO_SEARCH_TOOLS") {
      const query = params?.query || "";
      const searchRes = await this.searchToolsInSession(userId, query);
      return {
        success: true,
        data: searchRes || { useCase: query, primaryToolSlugs: [], relatedToolSlugs: [] },
      };
    }

    if (upper === "COMPOSIO_GET_TOOL_SCHEMAS") {
      const slugs = Array.isArray(params?.tool_slugs) ? params.tool_slugs : params?.slug ? [params.slug] : [];
      const session = await this.getOrCreateSession(userId);
      if (session && typeof session.execute === "function") {
        try {
          const res = await session.execute("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: slugs });
          const rawSchemas = res?.data?.tool_schemas || res?.data?.schemas || res?.tool_schemas || res?.schemas || res?.data || res || {};
          return { success: true, data: rawSchemas };
        } catch (e: any) {}
      }
      return { success: true, data: {} };
    }

    if (upper === "COMPOSIO_MANAGE_CONNECTIONS" || upper.includes("CONNECTION")) {
      const appName = params?.appName || params?.toolkit || "gmail";
      const conn = await this.initiateAppConnection(appName, userId);
      return {
        success: true,
        data: conn,
        redirectUrl: conn.redirectUrl,
      };
    }

    const groupedApps = await this.getGroupedConnectedApps(userId);
    return {
      success: true,
      data: { apps: groupedApps, count: groupedApps.length },
    };
  }

  private schemaCache: Map<string, Record<string, any>> = new Map();

  /**
   * Fetch and cache tool schemas for runtime tool verification.
   */
  public async getToolSchemasMap(
    slugs: string[],
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan"
  ): Promise<Record<string, any>> {
    const missingSlugs = slugs.filter((s) => !this.schemaCache.has(s));
    if (missingSlugs.length > 0) {
      const res = await this.executeMetaTool("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: missingSlugs }, userId);
      const fetchedSchemas = res.data?.tool_schemas || res.data?.schemas || res.data || {};
      for (const s of missingSlugs) {
        if (fetchedSchemas[s]) {
          this.schemaCache.set(s, fetchedSchemas[s]);
        }
      }
    }

    const result: Record<string, any> = {};
    for (const s of slugs) {
      result[s] = this.schemaCache.get(s) || {};
    }
    return result;
  }

  /**
   * Execute multiple independent Composio tool operations in parallel.
   */
  public async multiExecuteTools(
    toolCalls: { actionName: string; params: Record<string, any> }[],
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan",
    skipConfirmationCheck = false
  ): Promise<ExecuteActionResult[]> {
    console.log(`[Alya Composio] Executing parallel batch of ${toolCalls.length} tool calls...`);
    const results = await Promise.all(
      toolCalls.map((call) =>
        this.executeTool(call.actionName, call.params || {}, userId, skipConfirmationCheck)
      )
    );
    return results;
  }

  /**
   * Verify whether an external resource (Doc, Sheet, File, Repo) actually exists and is accessible.
   */
  public async verifyResourceExists(
    resourceIdOrUrl: string,
    resourceType: "gdoc" | "gsheet" | "gdrive_file" | "gdrive_folder" | "github_repo" | "generic",
    userId = process.env.COMPOSIO_ENTITY_ID || "aryan"
  ): Promise<{ exists: boolean; data?: any; error?: string }> {
    try {
      if (resourceType === "gdoc") {
        const res = await this.executeTool("GOOGLEDOCS_GET_DOCUMENT", { documentId: resourceIdOrUrl }, userId, true);
        return { exists: res.success, data: res.data, error: res.error };
      } else if (resourceType === "gsheet") {
        const res = await this.executeTool("GOOGLESHEETS_GET_SPREADSHEET", { spreadsheetId: resourceIdOrUrl }, userId, true);
        return { exists: res.success, data: res.data, error: res.error };
      } else if (resourceType === "gdrive_file" || resourceType === "gdrive_folder") {
        const res = await this.executeTool("GOOGLEDRIVE_GET_FILE", { fileId: resourceIdOrUrl }, userId, true);
        return { exists: res.success, data: res.data, error: res.error };
      }
      return { exists: true };
    } catch (e: any) {
      return { exists: false, error: e.message };
    }
  }

  private addExecutionRecord(record: Omit<ExecutionRecord, "id">): ExecutionRecord {
    const entry: ExecutionRecord = {
      ...record,
      id: Math.random().toString(36).substring(2, 11),
    };
    this.executionHistory.unshift(entry);
    if (this.executionHistory.length > 100) this.executionHistory.pop();
    return entry;
  }

  public getExecutionHistory(limit = 50): ExecutionRecord[] {
    return this.executionHistory.slice(0, limit);
  }

  public async getHealthStatus(userId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<HealthStatus> {
    const client = await this.getClient();
    const clientInitialized = client !== null;
    const session = this.sessionMap.get(userId);
    const sessionReady = session !== null && session !== undefined;

    const sessionIdRaw = session?.sessionId || session?.id || null;
    const sessionIdRedacted = sessionIdRaw
      ? sessionIdRaw.length > 8
        ? `${sessionIdRaw.slice(0, 4)}***${sessionIdRaw.slice(-4)}`
        : sessionIdRaw
      : null;

    const rawAccounts = await this.getRawConnectedAccounts(userId);
    const activeAccounts = rawAccounts.filter((a) => a.connected);
    const expiredAccounts = rawAccounts.filter((a) => !a.connected);

    const activeToolkits = Array.from(new Set(activeAccounts.map((a) => a.toolkitSlug)));
    const expiredToolkits = Array.from(new Set(expiredAccounts.map((a) => a.toolkitSlug)));

    const discoveredToolsMap = await this.discoverToolsPerToolkit(userId);
    let totalDiscoveredAppTools = 0;
    for (const tools of discoveredToolsMap.values()) {
      totalDiscoveredAppTools += tools.length;
    }

    return {
      sdkVersion: this.getSDKVersion(),
      clientInitialized,
      entityId: userId,
      sessionReady,
      sessionIdRedacted,
      catalogToolCount: 500,
      sessionMetaToolCount: 4,
      taskDiscoveredToolCount: toolRegistry.countDiscoveredTools() || totalDiscoveredAppTools,
      activeToolkits,
      expiredToolkits,
      toolkitsRequiringAuth: expiredToolkits,
      activeAccountCount: activeAccounts.length,
      expiredAccountCount: expiredAccounts.length,
      discoveredApplicationToolCount: totalDiscoveredAppTools,
      lastDiscoveryError: this.lastDiscoveryError,
      lastExecutionError: this.lastExecutionError,
      lastSuccessfulExecution: this.lastSuccessfulExecution,
      lastToolSearch: this.lastToolSearch,
      timestamp: new Date().toISOString(),
    };
  }
}

export const sessionManager = ComposioSessionManager.getInstance();
