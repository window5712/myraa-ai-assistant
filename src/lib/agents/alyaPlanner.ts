import { evaluateActionSafety } from "./safetyControls";
import { getRegisteredTool, ToolSource } from "./toolRegistry";
import { executeComposioAction, searchTools, initiateAppConnection } from "../composio/composioClient";

/**
 * Alya AI Agent — Router & Multi-Step Planner Engine
 */

export type ExecutionCategory =
  | "LOCAL_COMPUTER"
  | "PERSONAL_BROWSER"
  | "COMPOSIO_APP"
  | "COMPOSIO_BROWSER"
  | "GEMINI_VISION"
  | "MULTI_TOOL";

export interface PlanStep {
  stepIndex: number;
  description: string;          // Concise user-facing activity status
  tool: string;                 // Action name or tool ID
  source: ToolSource;
  appName?: string;
  params: Record<string, any>;
  dependsOnStep?: number;
  sensitive: boolean;
}

export interface AgentPlan {
  id: string;
  goal: string;
  category: ExecutionCategory;
  steps: PlanStep[];
  estimatedDuration?: string;
  createdAt: string;
}

export interface StepResult {
  stepIndex: number;
  success: boolean;
  tool: string;
  data?: any;
  error?: string;
  skipped?: boolean;
  rerouted?: boolean;
  rerouteReason?: string;
  redirectUrl?: string;
}

export interface PlanExecutionResult {
  planId: string;
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  results: StepResult[];
  summary: string;
  error?: string;
  canceled?: boolean;
}

// Active plan cancellation tokens
const activeCancellations: Set<string> = new Set();

export function cancelActivePlan(planId: string) {
  activeCancellations.add(planId);
  console.log(`[Alya Planner] Cancellation requested for plan: "${planId}"`);
}

export function isPlanCanceled(planId: string): boolean {
  return activeCancellations.has(planId);
}

/**
 * Classify natural user prompt into one of the 6 execution categories.
 */
export function classifyRequestIntent(prompt: string): ExecutionCategory {
  const p = prompt.toLowerCase();

  // Multi-system requests
  if (
    (p.includes("and") || p.includes("then")) &&
    ((p.includes("chrome") || p.includes("browser")) && (p.includes("drive") || p.includes("gmail") || p.includes("github")))
  ) {
    return "MULTI_TOOL";
  }

  // Vision screen sharing
  if (p.includes("screen") || p.includes("see on my screen") || p.includes("what do you see") || p.includes("look at this code")) {
    return "GEMINI_VISION";
  }

  // Personal local browser
  if (
    p.includes("open chrome") ||
    p.includes("open this link") ||
    p.includes("my browser") ||
    p.includes("youtube") ||
    p.includes("google search") ||
    p.startsWith("open ") ||
    p.startsWith("search ")
  ) {
    return "PERSONAL_BROWSER";
  }

  // Google Workspace complete package requests
  if (
    p.includes("google doc") ||
    p.includes("google sheet") ||
    p.includes("report") ||
    p.includes("project report") ||
    p.includes("project folder") ||
    p.includes("workspace package") ||
    (p.includes("create") && p.includes("drive"))
  ) {
    return "COMPOSIO_APP";
  }

  // Composio Cloud Apps
  if (
    p.includes("gmail") ||
    p.includes("email") ||
    p.includes("github") ||
    p.includes("google drive") ||
    p.includes("drive") ||
    p.includes("slack") ||
    p.includes("notion") ||
    p.includes("calendar") ||
    p.includes("sheets") ||
    p.includes("docs") ||
    p.includes("linear")
  ) {
    return "COMPOSIO_APP";
  }

  // Composio Cloud Browser (for cloud scraping or external tasks)
  if (p.includes("cloud browser") || p.includes("headless browser") || p.includes("scrape cloud")) {
    return "COMPOSIO_BROWSER";
  }

  // Local Computer System
  if (p.includes("local file") || p.includes("system") || p.includes("theme") || p.includes("background")) {
    return "LOCAL_COMPUTER";
  }

  return "COMPOSIO_APP";
}

/**
 * Dynamically generate an agent execution plan for a user request.
 * Follows the PLAN -> DISCOVER -> AUTHENTICATE -> EXECUTE -> OBSERVE -> VERIFY -> REMEMBER -> CONTINUE paradigm.
 */
export async function createAgentPlan(userPrompt: string, connectedApps: string[] = []): Promise<AgentPlan> {
  const planId = Math.random().toString(36).substring(2, 11);
  const category = classifyRequestIntent(userPrompt);
  const p = userPrompt.toLowerCase();

  let steps: PlanStep[] = [];

  // Google Workspace complete package requests (Docs + Sheets + Drive)
  if (
    p.includes("report") ||
    p.includes("project report") ||
    (p.includes("doc") && p.includes("sheet")) ||
    p.includes("workspace package")
  ) {
    steps = [
      {
        stepIndex: 1,
        description: `Creating Google Drive folder for "${userPrompt.slice(0, 30)}"`,
        tool: "GOOGLEDRIVE_CREATE_FOLDER",
        source: "composio",
        appName: "googledrive",
        params: { name: userPrompt.slice(0, 40) },
        sensitive: false,
      },
      {
        stepIndex: 2,
        description: `Generating formatted Google Doc report in Drive folder`,
        tool: "GOOGLEDOCS_CREATE_DOCUMENT",
        source: "composio",
        appName: "googledocs",
        params: { title: `${userPrompt.slice(0, 30)} Report` },
        dependsOnStep: 1,
        sensitive: false,
      },
      {
        stepIndex: 3,
        description: `Creating matching Google Sheet metrics spreadsheet`,
        tool: "GOOGLESHEETS_CREATE_SPREADSHEET",
        source: "composio",
        appName: "googlesheets",
        params: { title: `${userPrompt.slice(0, 30)} Data` },
        dependsOnStep: 1,
        sensitive: false,
      },
      {
        stepIndex: 4,
        description: `Verifying resources and saving to task memory`,
        tool: "COMPOSIO_VERIFY_AND_REMEMBER",
        source: "composio",
        appName: "composio",
        params: {},
        dependsOnStep: 3,
        sensitive: false,
      },
    ];
  } else if (category === "PERSONAL_BROWSER") {
    if (userPrompt.toLowerCase().includes("search")) {
      const q = userPrompt.replace(/search|find|for|google|on/gi, "").trim();
      steps.push({
        stepIndex: 1,
        description: `Opening personal browser to search "${q}"`,
        tool: "browserSearch",
        source: "playwright",
        appName: "personal_chrome",
        params: { query: q },
        sensitive: false,
      });
    } else {
      let targetUrl = "https://google.com";
      const urlMatch = userPrompt.match(/https?:\/\/[^\s]+/i) || userPrompt.match(/[\w-]+\.(com|org|net|io|dev)[^\s]*/i);
      if (urlMatch) targetUrl = urlMatch[0];
      steps.push({
        stepIndex: 1,
        description: `Navigating personal browser to ${targetUrl}`,
        tool: "browserOpen",
        source: "playwright",
        appName: "personal_chrome",
        params: { url: targetUrl },
        sensitive: false,
      });
    }
  } else if (category === "COMPOSIO_APP") {
    // Dynamic runtime lookup via COMPOSIO_SEARCH_TOOLS
    const searchRes = await searchTools(userPrompt);
    let chosenTool = "GMAIL_LIST_MESSAGES";

    if (searchRes && searchRes.primaryToolSlugs.length > 0) {
      chosenTool = searchRes.primaryToolSlugs[0];
    } else {
      const lower = userPrompt.toLowerCase();
      if (lower.includes("github")) chosenTool = "GITHUB_LIST_NOTIFICATIONS";
      else if (lower.includes("doc")) chosenTool = "GOOGLEDOCS_CREATE_DOCUMENT";
      else if (lower.includes("sheet")) chosenTool = "GOOGLESHEETS_CREATE_SPREADSHEET";
      else if (lower.includes("drive")) chosenTool = "GOOGLEDRIVE_LIST_FILES";
      else if (lower.includes("slack")) chosenTool = "SLACK_LIST_CHANNELS";
      else if (lower.includes("calendar")) chosenTool = "GOOGLE_CALENDAR_LIST_EVENTS";
    }

    const toolMeta = getRegisteredTool(chosenTool);
    const safety = evaluateActionSafety(chosenTool, {});

    steps.push({
      stepIndex: 1,
      description: `Executing ${chosenTool} for your request...`,
      tool: chosenTool,
      source: "composio",
      appName: chosenTool.split("_")[0].toLowerCase(),
      params: {},
      sensitive: safety.requiresConfirmation,
    });
  } else if (category === "MULTI_TOOL") {
    steps = [
      {
        stepIndex: 1,
        description: "Opening personal browser to search requested document",
        tool: "browserSearch",
        source: "playwright",
        appName: "personal_chrome",
        params: { query: userPrompt },
        sensitive: false,
      },
      {
        stepIndex: 2,
        description: "Reading page contents from browser",
        tool: "browserReadPage",
        source: "playwright",
        appName: "personal_chrome",
        params: {},
        dependsOnStep: 1,
        sensitive: false,
      },
      {
        stepIndex: 3,
        description: "Uploading summary to Google Drive via Composio",
        tool: "GOOGLEDRIVE_UPLOAD_FILE",
        source: "composio",
        appName: "googledrive",
        params: {},
        dependsOnStep: 2,
        sensitive: true,
      },
    ];
  } else if (category === "COMPOSIO_BROWSER") {
    steps.push({
      stepIndex: 1,
      description: "Launching Composio Cloud Browser session...",
      tool: "COMPOSIO_BROWSER_TASK",
      source: "composio_browser",
      appName: "composio_browser",
      params: { task: userPrompt },
      sensitive: false,
    });
  } else {
    // Default fallback single step
    steps.push({
      stepIndex: 1,
      description: `Executing action for: "${userPrompt.slice(0, 40)}"`,
      tool: "browserOpen",
      source: "playwright",
      appName: "personal_chrome",
      params: { url: "https://google.com" },
      sensitive: false,
    });
  }

  return {
    id: planId,
    goal: userPrompt,
    category,
    steps,
    estimatedDuration: `${steps.length * 3}s`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Execute a multi-step AgentPlan sequentially with verification, step updates, and intelligent fallback.
 */
export async function executeAgentPlan(
  plan: AgentPlan,
  actionExecutors: {
    executeComposio: (tool: string, params: Record<string, any>, confirmed?: boolean) => Promise<{ success: boolean; data?: any; error?: string; requiresConfirmation?: boolean; confirmationMessage?: string; redirectUrl?: string }>;
    executePlaywright: (tool: string, params: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
    executeLocal: (tool: string, params: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
  },
  onStepStart?: (step: PlanStep) => void,
  onStepComplete?: (step: PlanStep, result: StepResult) => void
): Promise<PlanExecutionResult> {
  const results: StepResult[] = [];
  const stepOutputs: Record<number, any> = {};

  for (const step of plan.steps) {
    if (isPlanCanceled(plan.id)) {
      activeCancellations.delete(plan.id);
      return {
        planId: plan.id,
        success: false,
        canceled: true,
        completedSteps: results.filter((r) => r.success).length,
        totalSteps: plan.steps.length,
        results,
        summary: `Task "${plan.goal}" was canceled by user.`,
      };
    }

    // Dependency check
    if (step.dependsOnStep !== undefined) {
      const dep = results.find((r) => r.stepIndex === step.dependsOnStep);
      if (dep && !dep.success) {
        const skippedResult: StepResult = {
          stepIndex: step.stepIndex,
          tool: step.tool,
          success: false,
          skipped: true,
          error: `Skipped because step ${step.dependsOnStep} failed`,
        };
        results.push(skippedResult);
        onStepComplete?.(step, skippedResult);
        continue;
      }
    }

    onStepStart?.(step);

    let resolvedParams = { ...step.params };
    if (step.dependsOnStep !== undefined && stepOutputs[step.dependsOnStep]) {
      resolvedParams._dependencyData = stepOutputs[step.dependsOnStep];
    }

    let execRes: { success: boolean; data?: any; error?: string; requiresConfirmation?: boolean; confirmationMessage?: string; redirectUrl?: string };

    try {
      if (step.source === "composio") {
        execRes = await actionExecutors.executeComposio(step.tool, resolvedParams);

        // Intelligent Fallback: If Composio tool is missing connection or fails, attempt Playwright Local Browser
        if (!execRes.success && !execRes.requiresConfirmation && !execRes.redirectUrl) {
          console.log(`[Alya Fallback] Composio tool "${step.tool}" failed. Attempting Playwright Personal Browser fallback...`);
          const fbRes = await actionExecutors.executePlaywright("browserSearch", { query: plan.goal });
          if (fbRes.success) {
            const stepRes: StepResult = {
              stepIndex: step.stepIndex,
              tool: "browserSearch",
              success: true,
              data: fbRes.data,
              rerouted: true,
              rerouteReason: `Composio tool unavailable (${execRes.error}). Rerouted via personal Chrome browser.`,
            };
            results.push(stepRes);
            onStepComplete?.(step, stepRes);
            continue;
          }
        }
      } else if (step.source === "playwright") {
        execRes = await actionExecutors.executePlaywright(step.tool, resolvedParams);
      } else {
        execRes = await actionExecutors.executeLocal(step.tool, resolvedParams);
      }

      const stepResult: StepResult = {
        stepIndex: step.stepIndex,
        tool: step.tool,
        success: execRes.success,
        data: execRes.data,
        error: execRes.error,
        redirectUrl: execRes.redirectUrl,
      };

      if (execRes.success) {
        stepOutputs[step.stepIndex] = execRes.data;
      }

      results.push(stepResult);
      onStepComplete?.(step, stepResult);
    } catch (err: any) {
      const stepResult: StepResult = {
        stepIndex: step.stepIndex,
        tool: step.tool,
        success: false,
        error: err.message,
      };
      results.push(stepResult);
      onStepComplete?.(step, stepResult);
    }
  }

  const completedSteps = results.filter((r) => r.success).length;
  const totalSteps = plan.steps.length;
  const success = completedSteps === totalSteps;

  const summary = success
    ? `Done! I've completed all steps for "${plan.goal}" successfully.`
    : `Completed ${completedSteps} of ${totalSteps} steps for "${plan.goal}".`;

  return {
    planId: plan.id,
    success,
    completedSteps,
    totalSteps,
    results,
    summary,
  };
}
