import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import {
  sessionManager,
  ExecutionRecord as SMExecutionRecord,
  ConnectedAccountRecord,
  GroupedApp,
  SearchToolsResult as SMSearchToolsResult,
  ExecuteActionResult as SMExecuteActionResult,
  isActionSensitive as SMIsActionSensitive,
  formatToolkitTitle as SMFormatToolkitTitle,
} from "./sessionManager";

export type ExecutionRecord = SMExecutionRecord;

export interface ConnectedApp {
  id: string;
  toolkitSlug: string;
  name: string;
  status: "connected" | "disconnected" | "expired" | "error";
  connected: boolean;
  userId: string;
  connectedAccountId?: string;
  displayConnectedAccountId?: string;
  toolCount: number;
  availableTools?: string[];
  lastUpdated?: string;
}

export interface ComposioTool {
  name: string;
  description: string;
  appName: string;
  parameters?: Record<string, any>;
}

export type SearchToolsResult = SMSearchToolsResult;
export type ExecuteActionResult = SMExecuteActionResult;

export function isActionSensitive(actionName: string, description?: string): boolean {
  return SMIsActionSensitive(actionName, description);
}

export function formatToolkitTitle(slug: string): string {
  return SMFormatToolkitTitle(slug);
}

export function addExecutionRecord(record: Omit<ExecutionRecord, "id">): ExecutionRecord {
  const result = sessionManager.executeTool(record.tool, record.data || {}, "aryan", true);
  return {
    id: Math.random().toString(36).substring(2, 11),
    ...record,
  };
}

export function getExecutionHistory(limit = 50): ExecutionRecord[] {
  return sessionManager.getExecutionHistory(limit);
}

export async function getComposioClient(): Promise<any> {
  return await sessionManager.getClient();
}

export async function getComposioSession(
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan",
  forceRefresh = false
): Promise<any> {
  return await sessionManager.getOrCreateSession(entityId, forceRefresh);
}

export async function initiateAppConnection(
  appName: string,
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<{ redirectUrl?: string; connectionId?: string; error?: string }> {
  return await sessionManager.initiateAppConnection(appName, entityId);
}

/**
 * Legacy ConnectedApp interface adapter for getConnectedApps.
 * Uses sessionManager's grouped connected apps with accurate tool counts.
 */
export async function getConnectedApps(entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<ConnectedApp[]> {
  const grouped = await sessionManager.getGroupedConnectedApps(entityId);
  const result: ConnectedApp[] = [];

  for (const group of grouped) {
    // Add primary active or expired account
    const mainAcc = group.activeAccounts[0] || group.expiredAccounts[0];
    const connId = mainAcc?.id || group.selectedAccountId || `conn_${group.toolkitSlug}`;
    const displayId = mainAcc?.displayConnectedAccountId || connId;

    result.push({
      id: connId,
      toolkitSlug: group.toolkitSlug,
      name: group.name,
      status: group.status,
      connected: group.connected,
      userId: entityId,
      connectedAccountId: connId,
      displayConnectedAccountId: displayId,
      toolCount: group.toolCount,
      availableTools: group.availableTools,
      lastUpdated: mainAcc?.updatedAt || new Date().toISOString(),
    });
  }

  return result;
}

export async function disconnectAppConnection(connectedAccountId: string): Promise<{ success: boolean; error?: string }> {
  return await sessionManager.disconnectAppConnection(connectedAccountId);
}

export async function searchTools(
  query: string,
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<SearchToolsResult | null> {
  return await sessionManager.searchToolsInSession(entityId, query);
}

export async function getToolSchemas(
  slugs: string[],
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<Record<string, any>> {
  const res = await sessionManager.executeTool("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: slugs }, entityId, true);
  return res.data?.tool_schemas || res.data?.schemas || res.data || {};
}

export async function discoverTools(entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"): Promise<ComposioTool[]> {
  const grouped = await sessionManager.getGroupedConnectedApps(entityId);
  const discovered: ComposioTool[] = [];

  for (const app of grouped) {
    if (app.connected) {
      for (const toolSlug of app.availableTools) {
        discovered.push({
          name: toolSlug,
          description: `${app.name} tool: ${toolSlug.replace(/_/g, " ")}`,
          appName: app.toolkitSlug,
          parameters: {},
        });
      }
    }
  }

  return discovered;
}

export async function executeComposioAction(
  actionName: string,
  params: Record<string, any>,
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan",
  skipConfirmationCheck = false
): Promise<ExecuteActionResult> {
  return await sessionManager.executeTool(actionName, params, entityId, skipConfirmationCheck);
}

export async function multiExecuteComposioActions(
  toolCalls: { actionName: string; params: Record<string, any> }[],
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan",
  skipConfirmationCheck = false
): Promise<ExecuteActionResult[]> {
  return await sessionManager.multiExecuteTools(toolCalls, entityId, skipConfirmationCheck);
}

export async function verifyResourceExists(
  resourceIdOrUrl: string,
  resourceType: "gdoc" | "gsheet" | "gdrive_file" | "gdrive_folder" | "github_repo" | "generic",
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<{ exists: boolean; data?: any; error?: string }> {
  return await sessionManager.verifyResourceExists(resourceIdOrUrl, resourceType, entityId);
}
