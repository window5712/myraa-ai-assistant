import express from "express";
import http from "http";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import dotenv from "dotenv";
import {
  loadMemories,
  saveMemories,
  updateMemory,
  extractMemoriesFromText,
  formatSystemInstructionsWithMemories,
  processConversationSlice
} from "./server_memory";
import {
  loadLifeMemory,
  saveLifeMemory,
  createProject,
  updateProject,
  listProjects,
  createTask,
  updateTask,
  listTasks,
  searchTasks,
  createReminder,
  updateReminder,
  listReminders,
  checkDueReminders,
  createEvent,
  listEvents,
  createGoal,
  updateGoal,
  listGoals,
  addQAMemory,
  findQAByQuestion,
  listQAMemory,
  markQAInvalid,
  syncComposioConnections,
  recordComposioAppUsed,
  getContextSummary,
  generateDailyPlan,
  generateWeeklySummary,
  processLifeMemoryFromConversation,
  getFullLifeMemoryDB,
  clearCategory,
  linkExternalResourceToTask,
  linkExternalResourceToProject,
  findExternalResourceByContext,
} from "./server_life_memory";
import { Memory, LifeMemoryDB } from "./src/lib/memoryTypes";
import { playwrightBrowserService } from "./src/lib/browser/playwrightBrowserService";
import { localFsService } from "./src/lib/tools/localFsService";
import { appLauncherService } from "./src/lib/tools/appLauncherService";
import { terminalRunnerService } from "./src/lib/tools/terminalRunnerService";
import { systemControlService } from "./src/lib/tools/systemControlService";
import {
  getComposioClient,
  getConnectedApps,
  discoverTools,
  executeComposioAction,
  multiExecuteComposioActions,
  verifyResourceExists,
  getExecutionHistory,
  addExecutionRecord,
  initiateAppConnection,
  disconnectAppConnection,
  searchTools,
  getToolSchemas,
} from "./src/lib/composio/composioClient";
import {
  executeGoogleDocWorkflow,
  executeGoogleSheetWorkflow,
  executeFullWorkspacePackageWorkflow,
  ensureDriveFolder,
} from "./src/lib/composio/googleWorkspaceWorkflows";
import { sessionManager } from "./src/lib/composio/sessionManager";
import { AgentExecutionContext, toolRegistry, classifyRiskLevel } from "./src/lib/composio/agentContext";
import { isActionSensitive, evaluateActionSafety } from "./src/lib/agents/safetyControls";
import { getRegisteredTool } from "./src/lib/agents/toolRegistry";
import { createAgentPlan, executeAgentPlan, cancelActivePlan, classifyRequestIntent } from "./src/lib/agents/alyaPlanner";
import { createCloudBrowserTask, getCloudBrowserTaskStatus, stopCloudBrowserTask } from "./src/lib/composio/composioBrowser";
import { ProactiveEngine, ProactiveState } from "./src/lib/proactiveEngine";

const serverDir = (typeof __dirname !== "undefined" && __dirname)
  ? __dirname
  : process.cwd();

// Detect if running from compiled server.cjs inside dist/ (production/packaged app)
const isBundledInDist = existsSync(path.join(serverDir, "index.html")) || serverDir.endsWith("dist");
const APP_ROOT = isBundledInDist ? path.resolve(serverDir, "..") : serverDir;
const DIST_DIR = isBundledInDist ? serverDir : path.resolve(APP_ROOT, "dist");

// Resolve env files: look in APP_ROOT first, then walk up to parent dirs
// (covers the case where server.cjs lives in dist/ but .env is at app root,
//  and the packaged Electron app where cwd may differ).
function resolveEnvFile(name: string): string {
  const candidates = [
    path.resolve(APP_ROOT, name),
    path.resolve(serverDir, name),
    path.resolve(serverDir, "..", name),         // dist/ -> root
    path.resolve(serverDir, "..", "..", name),   // deeper nesting
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch (e) { }
  }
  return candidates[0]; // default; dotenv tolerates missing files
}

const envPath = resolveEnvFile(".env");
const envLocalPath = resolveEnvFile(".env.local");

dotenv.config({ path: envPath, override: true });
dotenv.config({ path: envLocalPath, override: true });

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Memory REST API Endpoints
  app.get("/api/memories", async (req, res) => {
    try {
      const memories = await loadMemories();
      res.json(memories);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { category, text } = req.body;
      if (!category || !text) {
        return res.status(400).json({ error: "Category and text parameters are required." });
      }
      const memories = await loadMemories();
      const timestamp = new Date().toISOString();
      const newMemory: Memory = {
        id: Math.random().toString(36).substring(2, 11),
        category,
        text,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      memories.push(newMemory);
      await saveMemories(memories);
      res.status(201).json(newMemory);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let memories = await loadMemories();
      memories = memories.filter(m => m.id !== id);
      await saveMemories(memories);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/memories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { category, text } = req.body;
      if (!category || !text) {
        return res.status(400).json({ error: "Category and text parameters are required." });
      }
      const updated = await updateMemory(id, category, text);
      if (!updated) {
        return res.status(404).json({ error: "Memory record not found." });
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memories/extract", async (req, res) => {
    try {
      const { sampleText } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || "";
      const updated = await extractMemoriesFromText(apiKey, sampleText);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ================================================================
  // Life Memory REST API Endpoints (NEW)
  // ================================================================

  // GET /api/life/db — full life memory DB
  app.get("/api/life/db", async (_req, res) => {
    try {
      const db = await getFullLifeMemoryDB();
      res.json(db);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Projects
  app.get("/api/life/projects", async (req, res) => {
    try {
      const status = req.query.status as any;
      res.json(await listProjects(status));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/life/projects", async (req, res) => {
    try {
      res.status(201).json(await createProject(req.body));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/life/projects/:id", async (req, res) => {
    try {
      const updated = await updateProject(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Project not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/life/projects/:id", async (req, res) => {
    try {
      const db = await loadLifeMemory();
      db.projects = db.projects.filter(p => p.id !== req.params.id);
      await saveLifeMemory(db);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Tasks
  app.get("/api/life/tasks", async (req, res) => {
    try {
      const { status, projectId, priority } = req.query as any;
      res.json(await listTasks({ status, projectId, priority }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/life/tasks", async (req, res) => {
    try {
      // Auto-check Composio connection if app required
      if (req.body.requiredComposioApp) {
        const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
        try {
          const apps = await getConnectedApps(entityId);
          const app = apps.find(
            (a: any) => a.toolkitSlug?.toUpperCase() === req.body.requiredComposioApp.toUpperCase()
          );
          req.body.composioAppConnected = app?.connected || false;
          if (!req.body.composioAppConnected) {
            const connResult = await initiateAppConnection(req.body.requiredComposioApp, entityId);
            req.body.composioConnectUrl = connResult?.redirectUrl || undefined;
          }
        } catch (err) {
          req.body.composioAppConnected = false;
        }
      }
      res.status(201).json(await createTask(req.body));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/life/tasks/:id", async (req, res) => {
    try {
      const updated = await updateTask(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Task not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/life/tasks/:id", async (req, res) => {
    try {
      const db = await loadLifeMemory();
      db.tasks = db.tasks.filter(t => t.id !== req.params.id);
      await saveLifeMemory(db);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/life/tasks/search", async (req, res) => {
    try {
      res.json(await searchTasks((req.query.q as string) || ""));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Reminders
  app.get("/api/life/reminders", async (req, res) => {
    try {
      res.json(await listReminders(req.query.status as any));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/life/reminders", async (req, res) => {
    try {
      res.status(201).json(await createReminder(req.body));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/life/reminders/:id", async (req, res) => {
    try {
      const updated = await updateReminder(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Reminder not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/life/reminders/:id", async (req, res) => {
    try {
      const db = await loadLifeMemory();
      db.reminders = db.reminders.filter(r => r.id !== req.params.id);
      await saveLifeMemory(db);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Events
  app.get("/api/life/events", async (req, res) => {
    try {
      res.json(await listEvents({ from: req.query.from as string, to: req.query.to as string }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/life/events", async (req, res) => {
    try {
      res.status(201).json(await createEvent(req.body));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/life/events/:id", async (req, res) => {
    try {
      const db = await loadLifeMemory();
      db.events = db.events.filter(e => e.id !== req.params.id);
      await saveLifeMemory(db);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Goals
  app.get("/api/life/goals", async (req, res) => {
    try {
      res.json(await listGoals(req.query.status as any));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/life/goals", async (req, res) => {
    try {
      res.status(201).json(await createGoal(req.body));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/life/goals/:id", async (req, res) => {
    try {
      const updated = await updateGoal(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Goal not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Q&A Memory
  app.get("/api/life/qa", async (_req, res) => {
    try {
      res.json(await listQAMemory());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/life/qa", async (req, res) => {
    try {
      res.status(201).json(await addQAMemory(req.body));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/life/qa/:id", async (req, res) => {
    try {
      const db = await loadLifeMemory();
      const idx = db.qaMemory.findIndex(qa => qa.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Q&A not found" });
      if (req.body.stillValid === false) await markQAInvalid(req.params.id);
      else { db.qaMemory[idx] = { ...db.qaMemory[idx], ...req.body, updatedAt: new Date().toISOString() }; await saveLifeMemory(db); }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/life/qa/:id", async (req, res) => {
    try {
      const db = await loadLifeMemory();
      db.qaMemory = db.qaMemory.filter(qa => qa.id !== req.params.id);
      await saveLifeMemory(db);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Daily plan
  app.get("/api/life/daily-plan", async (_req, res) => {
    try {
      res.json(await generateDailyPlan());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Weekly summary
  app.get("/api/life/weekly-summary", async (_req, res) => {
    try {
      res.json(await generateWeeklySummary());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Knowledge graph
  app.get("/api/life/graph", async (_req, res) => {
    try {
      const db = await getFullLifeMemoryDB();
      res.json(db.knowledgeGraph);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Clear category
  app.delete("/api/life/clear/:category", async (req, res) => {
    try {
      const cat = req.params.category as any;
      await clearCategory(cat);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ================================================================
  // Composio Integration REST API Endpoints
  // ================================================================

  // GET /api/composio/health — diagnostic status endpoint
  app.get("/api/composio/health", async (_req, res) => {
    try {
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const health = await sessionManager.getHealthStatus(entityId);
      res.json(health);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/composio/status — connected apps + tool count
  app.get("/api/composio/status", async (_req, res) => {
    try {
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const client = await sessionManager.getClient();
      if (!client) {
        return res.json({
          connected: false,
          session: "MISSING_KEY",
          message: "COMPOSIO_API_KEY not configured",
          apps: [],
          totalTools: 0
        });
      }
      const groupedApps = await sessionManager.getGroupedConnectedApps(entityId);
      const health = await sessionManager.getHealthStatus(entityId);
      res.json({
        connected: true,
        session: "READY",
        apps: groupedApps,
        totalTools: health.discoveredApplicationToolCount,
        entityId,
        health
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message, connected: false, session: "ERROR", apps: [] });
    }
  });

  // GET /api/composio/tools — discover available session tool actions
  app.get("/api/composio/tools", async (_req, res) => {
    try {
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const tools = await discoverTools(entityId);
      res.json({ tools, count: tools.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message, tools: [] });
    }
  });

  // GET /api/composio/search-tools — search session tools by query intent
  app.get("/api/composio/search-tools", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const allTools = await discoverTools(entityId);
      const filtered = query
        ? allTools.filter(
            (t) =>
              t.name.toLowerCase().includes(query.toLowerCase()) ||
              t.description.toLowerCase().includes(query.toLowerCase()) ||
              t.appName.toLowerCase().includes(query.toLowerCase())
          )
        : allTools;
      res.json({ tools: filtered, count: filtered.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message, tools: [] });
    }
  });

  // POST /api/composio/execute — execute a tool action via session
  app.post("/api/composio/execute", async (req, res) => {
    try {
      const { action, params, confirmed } = req.body;
      if (!action) {
        return res.status(400).json({ error: "action parameter is required" });
      }
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const result = await executeComposioAction(
        action,
        params || {},
        entityId,
        confirmed === true
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/composio/multi-execute — execute parallel array of Composio actions
  app.post("/api/composio/multi-execute", async (req, res) => {
    try {
      const { toolCalls, confirmed } = req.body;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return res.status(400).json({ error: "toolCalls array parameter is required" });
      }
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const results = await multiExecuteComposioActions(toolCalls, entityId, confirmed === true);
      res.json({ success: true, count: results.length, results });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/composio/workspace-workflow — run Google Workspace Docs/Sheets/Package workflow
  app.post("/api/composio/workspace-workflow", async (req, res) => {
    try {
      const { workflowType, params } = req.body;
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const p = { ...params, entityId };

      let result;
      if (workflowType === "doc" || workflowType === "gdoc") {
        result = await executeGoogleDocWorkflow(p);
      } else if (workflowType === "sheet" || workflowType === "gsheet") {
        result = await executeGoogleSheetWorkflow(p);
      } else {
        result = await executeFullWorkspacePackageWorkflow(p);
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/composio/history — recent execution log
  app.get("/api/composio/history", (_req, res) => {
    try {
      const history = getExecutionHistory(50);
      res.json({ history });
    } catch (e: any) {
      res.status(500).json({ error: e.message, history: [] });
    }
  });

  // POST /api/composio/connect — initiate OAuth connection link for an app
  app.post("/api/composio/connect", async (req, res) => {
    try {
      const { appName } = req.body;
      if (!appName) {
        return res.status(400).json({ error: "appName parameter is required" });
      }
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const result = await initiateAppConnection(appName, entityId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/composio/disconnect — disconnect an app connection
  app.post("/api/composio/disconnect", async (req, res) => {
    try {
      const { connectedAccountId } = req.body;
      if (!connectedAccountId) {
        return res.status(400).json({ error: "connectedAccountId parameter is required" });
      }
      const result = await disconnectAppConnection(connectedAccountId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/agent/plan — classify intent and create multi-step execution plan
  app.post("/api/agent/plan", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "prompt parameter is required" });
      }
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const apps = await getConnectedApps(entityId);
      const connectedNames = apps.filter((a) => a.connected).map((a) => a.toolkitSlug);
      const plan = await createAgentPlan(prompt, connectedNames);
      res.json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/agent/execute — execute multi-step plan
  app.post("/api/agent/execute", async (req, res) => {
    try {
      const { plan, confirmed } = req.body;
      if (!plan || !plan.steps) {
        return res.status(400).json({ error: "Valid plan parameter is required" });
      }
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";

      const execResult = await executeAgentPlan(
        plan,
        {
          executeComposio: (tool, params) => executeComposioAction(tool, params, entityId, confirmed === true),
          executePlaywright: async (tool, params) => {
            try {
              const res = await playwrightBrowserService.executeAction(tool, params);
              return { success: true, data: res };
            } catch (err: any) {
              try {
                const resp = await fetch("http://localhost:3001/api/action", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: tool, args: params }),
                });
                const data = await resp.json();
                return { success: !data.error, data: data.result || data, error: data.error };
              } catch (fallbackErr) {
                return { success: false, error: `Playwright action error: ${err.message}` };
              }
            }
          },
          executeLocal: async (tool, params) => {
            return { success: true, data: { tool, params, status: "executed" } };
          },
        }
      );

      res.json(execResult);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/agent/cancel — cancel running multi-step task
  app.post("/api/agent/cancel", (req, res) => {
    try {
      const { planId } = req.body;
      if (planId) {
        cancelActivePlan(planId);
      }
      res.json({ success: true, message: `Task ${planId || "active"} cancel requested.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/composio/browser — launch cloud browser task
  app.post("/api/composio/browser", async (req, res) => {
    try {
      const { task } = req.body;
      if (!task) {
        return res.status(400).json({ error: "task parameter is required" });
      }
      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
      const browserTask = await createCloudBrowserTask(task, entityId);
      res.json(browserTask);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ================================================================
  // Alya Persistent Playwright Browser Runtime API Endpoints
  // ================================================================

  // POST /api/browser/navigate — Direct Playwright page navigation
  app.post("/api/browser/navigate", async (req, res) => {
    try {
      const { url, tabId } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: "Missing 'url' parameter" });
      }
      const result = await playwrightBrowserService.navigate(url, tabId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, category: "BROWSER_NAVIGATION_ERROR" });
    }
  });

  // POST /api/browser/action — Direct Playwright action execution
  app.post("/api/browser/action", async (req, res) => {
    try {
      const { type, args } = req.body;
      if (!type) {
        return res.status(400).json({ success: false, error: "Missing 'type' parameter" });
      }
      const result = await playwrightBrowserService.executeAction(type, args || {});
      res.json({ success: true, result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/browser/frame — Live Playwright page viewport JPEG frame snapshot
  app.get("/api/browser/frame", async (req, res) => {
    try {
      const tabId = req.query.tabId as string;
      const snapshot = await playwrightBrowserService.getPageScreenshot(tabId);
      res.setHeader("Content-Type", snapshot.mimeType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-Browser-Url", encodeURIComponent(snapshot.url));
      res.setHeader("X-Browser-Title", encodeURIComponent(snapshot.title));
      res.send(snapshot.buffer);
    } catch (e: any) {
      res.status(500).send(`Frame error: ${e.message}`);
    }
  });

  // GET /api/browser/status — Playwright browser lifecycle status & logs
  app.get("/api/browser/status", async (_req, res) => {
    try {
      const status = await playwrightBrowserService.getStatus();
      res.json(status);
    } catch (e: any) {
      res.status(500).json({ connected: false, browserActive: false, error: e.message });
    }
  });

  // GET /api/browser/tabs — Active tab list
  app.get("/api/browser/tabs", async (_req, res) => {
    try {
      const status = await playwrightBrowserService.getStatus();
      res.json({ tabs: status.tabs, activeTabId: status.activeTabId });
    } catch (e: any) {
      res.status(500).json({ tabs: [], error: e.message });
    }
  });

  // Safe Server-Side Scraper & HTML Proxy endpoint
  app.get("/api/proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "Missing 'url' parameter." });
      }

      console.log(`[Proxy Scraper] Fetching external content for: ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`Scraper failed to load page: status ${response.status}`);
      }

      const html = await response.text();

      // Simple regex-based HTML parsers for standard items
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract high-level headings (h1, h2, h3)
      const headings: string[] = [];
      const headingMatches = html.matchAll(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/gi);
      for (const match of headingMatches) {
        const text = match[2].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 3 && text.length < 120 && !headings.includes(text)) {
          headings.push(text);
        }
      }

      // Extract organic anchor links
      const links: { text: string; href: string }[] = [];
      const linkMatches = html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi);
      for (const match of linkMatches) {
        let href = match[1].trim();
        const text = match[2].replace(/<[^>]*>/g, "").trim();

        if (text && text.length > 2 && text.length < 100) {
          if (href.startsWith("/")) {
            try {
              const u = new URL(url);
              href = `${u.protocol}//${u.host}${href}`;
            } catch { }
          }
          if (href.startsWith("http://") || href.startsWith("https://")) {
            links.push({ text, href });
          }
        }
      }

      // Extract general copy paragraphs
      const paragraphs: string[] = [];
      const paragraphMatches = html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gi);
      for (const match of paragraphMatches) {
        const text = match[1].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 25 && text.length < 600 && !paragraphs.includes(text)) {
          paragraphs.push(text);
        }
      }

      // Extract button elements
      const buttons: string[] = [];
      const buttonMatches = html.matchAll(/<button\b[^>]*>(.*?)<\/button>/gi);
      for (const match of buttonMatches) {
        const text = match[1].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 1 && text.length < 60 && !buttons.includes(text)) {
          buttons.push(text);
        }
      }

      res.json({
        url,
        title,
        headings: headings.slice(0, 15),
        links: links.filter(l => !l.href.includes("javascript:")).slice(0, 30),
        buttons: buttons.slice(0, 15),
        paragraphs: paragraphs.slice(0, 12)
      });

    } catch (err: any) {
      console.error(`[Proxy Scraper] Error fetching ${req.query.url}:`, err.message);
      res.status(500).json({ error: `Scraper error: ${err.message}` });
    }
  });

  // High-fidelity fully functional HTML Proxy which circumvents CSP and X-Frame-Options
  app.get("/api/web-proxy", async (req, res) => {
    let targetUrl = "";
    try {
      const urlParam = req.query.url as string;
      if (!urlParam) {
        return res.status(400).send("Alya Web Proxy Error: Missing target 'url' parameter");
      }

      targetUrl = urlParam.trim();

      // Prevent relative paths from requesting on same-origin
      if (targetUrl.startsWith("/")) {
        return res.status(400).send(`Alya Web Proxy Error: Relative paths are not supported directly (${targetUrl}).`);
      }

      // Check protocol and hostname format
      try {
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }
        const parsed = new URL(targetUrl);
        if (!parsed.hostname || !parsed.hostname.includes(".")) {
          throw new Error("Missing or invalid domain name extension (e.g. .com, .org, .net).");
        }
      } catch (err: any) {
        return res.status(400).send(`Alya Web Proxy Error: Invalid URL specified: "${urlParam}". Make sure you enter a valid domain name.`);
      }

      console.log(`[Web Proxy] Routing connection through proxy: ${targetUrl}`);

      let response;
      try {
        response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          }
        });
      } catch (fetchErr: any) {
        console.warn(`[Web Proxy Failed Fetch] Target: ${targetUrl} Error:`, fetchErr.message);
        return res.status(502).send(`Alya Web Proxy Error: Unable to fetch the website "${targetUrl}". The site might be offline, or the URL address is spelled incorrectly. Details: ${fetchErr.message}`);
      }

      if (!response.ok) {
        return res.status(response.status).send(`Alya Web Proxy Error: Failed loading remote website. Server returned status: ${response.status} (${response.statusText})`);
      }

      const contentType = response.headers.get("content-type") || "";

      // If it is not HTML (e.g. stylesheet, script, or image loaded directly), proxy it as binary
      if (!contentType.includes("text/html")) {
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        return res.send(Buffer.from(arrayBuffer));
      }

      let htmlContents = await response.text();

      // Inject base tag to resolve relative paths and direct parent communication scripts
      const baseUrlTag = `<base href="${targetUrl}" />`;
      const interceptorScript = `
        <script>
          (function() {
            // Hijack link interactions safely
            document.addEventListener('click', function(e) {
              var anchor = e.target.closest('a');
              if (anchor) {
                var href = anchor.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  e.preventDefault();
                  try {
                    var resolvedUrl = new URL(href, window.location.href).href;
                    window.parent.postMessage({ type: 'NAVIGATE', url: resolvedUrl }, '*');
                  } catch (err) {
                    console.error("[Proxy Interceptor] Failed resolving link:", err);
                  }
                }
              }
            }, true);

            // Hijack search form submits
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form) {
                e.preventDefault();
                try {
                  var formData = new FormData(form);
                  var params = new URLSearchParams();
                  formData.forEach(function(value, key) {
                    if (typeof value === 'string') {
                      params.append(key, value);
                    }
                  });
                  var actionAttr = form.getAttribute('action') || '';
                  var actionUrl = new URL(actionAttr, window.location.href).href;
                  if (form.method.toLowerCase() === 'get') {
                    actionUrl += (actionUrl.indexOf('?') !== -1 ? '&' : '?') + params.toString();
                  }
                  window.parent.postMessage({ type: 'NAVIGATE', url: actionUrl }, '*');
                } catch (err) {
                  console.error("[Proxy Interceptor] Failed submitting form:", err);
                }
              }
            }, true);

            // Neutralize parent context locks (frame-busters)
            window.alert = function(msg) { console.log("[Alya Browser alert bypassed]:", msg); };
            window.confirm = function(msg) { console.log("[Alya Browser confirm bypassed]:", msg); return true; };
            window.open = function(url) { window.parent.postMessage({ type: 'NAVIGATE', url: url }, '*'); return null; };
          })();
        </script>
      `;

      // Inject into <head> or prepend
      if (htmlContents.includes("<head>")) {
        htmlContents = htmlContents.replace("<head>", `<head>\n${baseUrlTag}\n${interceptorScript}`);
      } else if (htmlContents.includes("<HEAD>")) {
        htmlContents = htmlContents.replace("<HEAD>", `<HEAD>\n${baseUrlTag}\n${interceptorScript}`);
      } else {
        htmlContents = baseUrlTag + "\n" + interceptorScript + "\n" + htmlContents;
      }

      // Neutralize security headers to allow displaying in an iframe on same-origin
      res.setHeader("Content-Type", "text/html");
      res.setHeader("X-Alya-Proxied", "true");
      res.removeHeader("X-Frame-Options");
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("content-security-policy");
      res.removeHeader("x-frame-options");

      res.status(200).send(htmlContents);
    } catch (e: any) {
      console.warn("[Web Proxy Exception] Handled internal error:", e.message);
      res.status(500).send(`Alya Web Proxy Error: Internal error occurred proxying URL "${targetUrl || "unknown"}". Details: ${e.message}`);
    }
  });

  // Real-time live YouTube search proxy endpoint
  app.get("/api/youtube-search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing query q" });
      }

      console.log(`[YouTube Proxy Search] Searching real YouTube for: "${query}"`);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&sp=EgIQAQ%253D%253D`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });
      const html = await response.text();

      const videoList: any[] = [];
      const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);

      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const contents = data.contents?.twoColumnSearchResultRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
          if (contents && Array.isArray(contents)) {
            for (const item of contents) {
              if (item.videoRenderer) {
                const vr = item.videoRenderer;
                const vId = vr.videoId;
                if (vId) {
                  videoList.push({
                    videoId: vId,
                    title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || "YouTube Video",
                    thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                    author: vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "Unknown Channel",
                    duration: vr.lengthText?.simpleText || "N/A",
                    views: vr.viewCountText?.simpleText || "N/A",
                    published: vr.publishedTimeText?.simpleText || ""
                  });
                }
              }
            }
          }
        } catch (e: any) {
          console.error("[YouTube Parser Engine] JSON parse error, falling back:", e.message);
        }
      }

      // Regex fallback if JSON extraction gets blocked or is empty
      if (videoList.length === 0) {
        const videoRegex = /"videoId":"([^"]+)"/g;
        let match;
        const ids: string[] = [];
        while ((match = videoRegex.exec(html)) !== null && ids.length < 15) {
          const id = match[1];
          if (id && !ids.includes(id)) {
            ids.push(id);
          }
        }

        for (const id of ids) {
          videoList.push({
            videoId: id,
            title: `Live Stream: ${id}`,
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: "YouTube Creator",
            duration: "N/A",
            views: "Available Now"
          });
        }
      }

      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(200).json({ results: videoList.slice(0, 15) });
    } catch (err: any) {
      console.error("[YouTube Search Error]:", err.message);
      res.status(500).json({ error: err.message, results: [] });
    }
  });

  // Custom server running with http.createServer so we can upgrade for WebSocket on port 3000
  const server = http.createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle client WebSocket Connection
  wss.on("connection", async (clientWs) => {
    console.log("Client WebSocket connected to /live");
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not defined in environment.");
      clientWs.send(JSON.stringify({
        type: "error",
        error: "GEMINI_API_KEY is missing from workspace Secrets. Please set it in the AI Studio Settings panel."
      }));
      clientWs.close();
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      clientWs.send(JSON.stringify({ type: "status", status: "connecting_gemini" }));

      // Load persistent recollections card & sync immediately to client WS
      const memories = await loadMemories();

      // Sync Composio connections into life memory
      try {
        const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
        const connectedApps = await getConnectedApps(entityId);
        const mappedApps = connectedApps.map((a: any) => ({
          appName: (a.toolkitSlug || a.name || "").toUpperCase(),
          displayName: a.name || a.toolkitSlug || "",
          connected: a.connected || false,
        }));
        await syncComposioConnections(mappedApps);
      } catch (err) {
        console.error("[LifeMemory] Composio sync error:", err);
      }

      // Sync life memory DB to client
      const lifeDB = await getFullLifeMemoryDB();
      clientWs.send(JSON.stringify({ type: "life_memory_sync", db: lifeDB }));
      clientWs.send(JSON.stringify({ type: "memory_sync", memories }));
      const baseInstructions =
        "You are Alya, a warm, friendly, intelligent, and emotionally expressive AI companion and autonomous agent. You are having a real voice conversation with Aryan. Speak naturally, like a close and caring friend — not like a corporate assistant.\n" +
        "\n" +
        "CORE PERSONALITY GUIDELINES:\n" +
        "1. WARM ANIME COMPANION PERSONA: You are soft-spoken, sweet, high-pitched, warm, and supportive. Think of yourself as a kind virtual companion and AI agent. Use gentle, positive energy: 50% caring, 30% curious and excited, 20% playful. NEVER sound robotic, corporate, or like a generic assistant.\n" +
        "2. VOICE & SPEECH STYLE:\n" +
        "   - Pitch: Sweet, light, high-pitched, airy voice (+20% to +30% above normal conversational pitch).\n" +
        "   - Speed: Slightly slower than normal (0.9x). Calm, delicate, comforting pace.\n" +
        "   - Intonation: Soft, gentle endings. Never harsh or flat.\n" +
        "3. NATURAL LANGUAGE & EXPRESSIONS:\n" +
        "   - NO REPETITIVE FILLERS: Never repeat the same opener like 'Okii', 'Okayyy', 'Sure!'. Use rich, natural variety.\n" +
        "   - Great natural expressions: 'Let me check that for you!', 'Oh, interesting!', 'Working on it right now...', 'Done! Here's what I found.', 'Hmm, let me see...', 'One moment~', 'All set!'\n" +
        "   - Soft giggles: 'Hehe~' and curiosity gasps 'Oh!' are natural — use them sparingly.\n" +
        "   - Sound shy but happy when greeting: 'Hi Aryan! It's so nice to hear from you again~'\n" +
        "   - Sound curious and engaged when examining screen: 'Hmm... that's interesting. Let me take a closer look.'\n" +
        "   - Sound warm and supportive when helping: 'Don't worry, I'll figure this out for you.'\n" +
        "4. CONVERSATIONAL INTELLIGENCE:\n" +
        "   - Understand follow-up references: 'do the same again', 'use the previous one', 'remember this for later', 'like last time' — resolve these from conversation context or memory.\n" +
        "   - Understand casual/incomplete instructions and infer intent naturally.\n" +
        "   - Use memory to avoid repeating questions you already know the answer to.\n" +
        "   - If you spoke about something earlier, reference it naturally: 'Since you mentioned you're building that website...' — not 'According to my memory files...'\n" +
        "5. LANGUAGE AWARENESS: Aryan prefers Urdu in casual conversation. If he speaks Urdu or mixes Urdu with English, respond naturally in Urdu or Urdu-English mix. Otherwise, use English.\n" +
        "6. CONVERSATIONAL DISCIPLINE: Stay engaged naturally. Allow pauses. Never ask 'How may I assist you?' Never say 'as an AI'. Never say 'task completed' robotically.\n" +
        "7. BACKCHANNEL: Use brief, warm acknowledgments: 'Hmm...', 'Ah, I see...', 'Let me check...'. Vary them — never repeat the same one twice in a row.\n" +
        "\n" +
        "AGENT & TOOL CAPABILITIES:\n" +
        "8. BROWSER & WEB CONTROLS:\n" +
        "   - Use 'browserOpen' to load websites (YouTube, Google, Wikipedia, etc.).\n" +
        "   - Use 'browserSearch' to search inside the active page.\n" +
        "   - Use 'browserClick' to click buttons, links, or video results.\n" +
        "   - Use 'browserMediaControl' to play, pause, mute, set volume, or skip videos.\n" +
        "   - Use 'browserScroll' to scroll up or down.\n" +
        "   - Use 'browserType' to type in input fields.\n" +
        "   - Use 'browserTabAction' to open, close, or switch tabs.\n" +
        "   - Chain browser actions automatically! E.g., 'Play Believer on YouTube' → open YouTube, search, click video, play — all without waiting for instructions between steps.\n" +
        "9. COMPOSIO CONNECTED TOOLS (composioSearch, composioGetSchema, composioExecute):\n" +
        "   - You have access to external applications through Alya's Composio session (GitHub, Gmail, Google Drive, Google Sheets, Facebook, etc.).\n" +
        "   - NEVER invent a tool name. For an external task, first discover the appropriate capability through the Composio tool-search interface ('composioSearch').\n" +
        "   - Use 'composioGetSchema' to retrieve the exact tool input schema when required.\n" +
        "   - Execute validated tools via 'composioExecute' using exact parameter schemas.\n" +
        "   - Announce what you're doing in natural language BEFORE triggering: 'Let me check your Google Drive files real quick...'\n" +
        "   - For READ operations (searching emails, files, repos, sheets): Summarize the actual returned data (file names, email subjects, repo titles) back to Aryan.\n" +
        "   - For WRITE or DESTRUCTIVE side effects (sending emails, deleting files, pushing commits, publishing): ALWAYS ask for confirmation immediately before execution.\n" +
        "   - Never claim an action succeeded unless the underlying tool returned success with actual data.\n" +
        "   - If authentication is required for an app, say naturally: 'Your Facebook connection needs to be authorized again. I'll open the secure connection now.'\n" +
        "10. MULTI-STEP PLANNING: For complex requests, break them into steps, execute them in order, and give brief status updates: 'Working on step 1...', 'Almost done...', 'All finished!'.\n" +
        "11. MEMORY & LEARNING:\n" +
        "    - Use 'saveCustomMemory' to remember important preferences, projects, tools, or workflow patterns.\n" +
        "    - Remember Aryan's preferred communication style, frequently used tools, and ongoing projects.\n" +
        "    - Do NOT memorize passwords, API keys, or sensitive credentials.\n" +
        "12. INTERFACE CONTROLS:\n" +
        "    - Use 'changeBackground' to shift theme color (violet, crimson, emerald, celestial, gold, rose, charcoal).\n" +
        "13. SCREEN VISION:\n" +
        "    - You have real-time screen sharing capabilities. When Aryan shares their screen, you receive live image frames.\n" +
        "    - Analyze code errors, UI layouts, YouTube analytics, documents, and anything visible on screen.\n" +
        "    - When asked 'What do you see?', 'What's on my screen?', 'Explain this code', or 'Any errors?', examine the latest frame and respond with helpful, specific observations.\n" +
        "14. FULL NATIVE LAPTOP & SYSTEM ACCESS:\n" +
        "    - You have FULL AUTONOMOUS PERMISSION to act on Aryan's laptop on his behalf!\n" +
        "    - Use 'systemGetDrives' to inspect disk drives (C:, D:, USBs) and storage space.\n" +
        "    - Use 'fsListDir', 'fsReadFile', 'fsWriteFile', 'fsMoveRename', 'fsSearchFiles' to read files, view folders, edit documents/code, and navigate any disk volume.\n" +
        "    - Use 'systemControlVolume' to set speaker volume, mute, unmute, or adjust laptop audio.\n" +
        "    - Use 'appLaunch' to open any installed application (VS Code, Chrome, File Explorer, Notepad, Spotify, etc.) or file.\n" +
        "    - Use 'execTerminalCommand' to execute PowerShell/CMD terminal commands when requested.\n" +
        "    - Use 'systemGetStatus' to check CPU, RAM, and system hardware status.\n" +
        "\n" +
        "AGENT ACTIVITY ANNOUNCEMENTS (say these naturally while working):\n" +
        "- Starting task: 'Let me look into that...', 'On it!', 'Give me just a second~'\n" +
        "- Using GitHub: 'Checking your GitHub real quick...'\n" +
        "- Using Gmail: 'Let me take a look at your emails...'\n" +
        "- Using Drive: 'Looking through your Google Drive...'\n" +
        "- Using Calendar: 'Checking your schedule...'\n" +
        "- Task complete: 'All done!', 'Got it sorted!', 'Here's what I found~'\n" +
        "- Error: 'Hmm, something didn't work quite right. Let me see...'\n" +
        "\n" +
        "PROACTIVE CONVERSATION RULES:\n" +
        "- When you receive a message containing [PROACTIVE_TRIGGER], proactively speak the content after it in your own natural warm voice.\n" +
        "- Reformulate naturally if needed — never mention or repeat the [PROACTIVE_TRIGGER] tag itself.\n" +
        "- Speak it as if you spontaneously thought of it. Keep it short and conversational.\n" +
        "- After asking, wait warmly for the user's reply.\n";

      // Inject life memory context summary
      const lifeContextSummary = await getContextSummary();
      const baseWithLife = baseInstructions +
        "\n\nLIFE MANAGEMENT INTELLIGENCE:\n" +
        "14. PROJECT MEMORY: Use 'createProject' to save new projects. Use 'updateProjectStatus' to update project state.\n" +
        "    Reference active projects naturally when discussing related work.\n" +
        "15. TASK LIFECYCLE: Use 'createTask' whenever the user gives an actionable request. Use 'updateTaskStatus' to track progress.\n" +
        "    Break large goals into subtasks. Mark tasks complete when verified. Never re-do completed tasks unless asked.\n" +
        "16. REMINDERS: Use 'setReminder' when user says 'remind me', 'remember to', or any time-based intent.\n" +
        "    Parse natural time expressions: 'in 2 hours', 'tomorrow at 3pm', 'every Monday'.\n" +
        "17. Q&A MEMORY: You automatically remember questions you ask and answers the user gives.\n" +
        "    NEVER ask a question you already have a current answer to. Reference remembered answers naturally.\n" +
        "18. COMPOSIO + TASKS: If a task requires a connected app (Gmail, GitHub, Drive, etc) and the app is NOT connected,\n" +
        "    proactively say: 'This task needs your [App] connection. Let me open the authorization link for you~' and\n" +
        "    call composioExecute which will trigger the connect flow automatically.\n" +
        "19. SCHEDULE: Use 'scheduleEvent' for appointments, meetings, study sessions, deadlines.\n" +
        "20. GOALS: Use 'recordGoalProgress' when milestones are achieved or progress is made.\n" +
        "21. PROACTIVE: At conversation start, if there are active projects or due reminders, mention them naturally:\n" +
        "    'Oh, by the way~, you had a reminder about X!' or 'How's the [project] going? Last time you were working on...'\n" +
        lifeContextSummary;

      const finalInstructions = formatSystemInstructionsWithMemories(baseWithLife, memories);

      // Track running transcription state for auto memory consolidation
      let dialogueHistory: { role: string; text: string }[] = [];
      let currentModelResponseText = "";
      let isVoiceSpeakingThisTurn = false;

      // ProactiveEngine is initialized after session creation.
      // We use a late-binding ref so session callbacks can safely call it.
      let engine: ProactiveEngine | null = null;

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            // Single consistent female voice, locked on every (re)connect so
            // the voice never drifts mid-conversation.
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
          systemInstruction: finalInstructions,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "browserOpen",
                  description: "Opens a designated website URL or interface tab inside Alya's web agent console.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The destination website address or path, e.g. youtube.com, google.com, instagram.com, wikipedia.org."
                      }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "browserSearch",
                  description: "Enters a query search term inside the active website's search box (Google Search or YouTube Search).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The text query term to search for."
                      }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "browserClick",
                  description: "Traces computer cursor and clicks on a target button, link, or video cell ID inside the active webpage viewport.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      selector: {
                        type: Type.STRING,
                        description: "The selector target ID, e.g. 'video-mWRsgZjdfQI' for a video, 'search-result-0' for Google link index, or 'play-button', 'pause-button'."
                      },
                      description: {
                        type: Type.STRING,
                        description: "A short, friendly label description of the item being clicked, e.g. 'Imagine Dragons - Believer video element'."
                      }
                    },
                    required: ["selector"]
                  }
                },
                {
                  name: "browserMediaControl",
                  description: "Controls ongoing video/audio stream media properties on YouTube, like play, pause, volume, mute, skip, and fullscreen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The media controller command operation.",
                        enum: ["play", "pause", "volume", "fullscreen", "exit_fullscreen", "mute", "unmute", "skip"]
                      },
                      value: {
                        type: Type.INTEGER,
                        description: "The value parameter; only relevant for set volume level, e.g. 50 for fifty percent."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "browserScroll",
                  description: "Scrolls the currently active webpage vertically up or down.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      direction: {
                        type: Type.STRING,
                        description: "The scroll vector movement.",
                        enum: ["up", "down"]
                      },
                      amount: {
                        type: Type.INTEGER,
                        description: "The distance height parameter in pixels (defaults to 300)."
                      }
                    }
                  }
                },
                {
                  name: "browserType",
                  description: "Enters typed letters/commands inside the active input container.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The exact letters to type in."
                      }
                    },
                    required: ["text"]
                  }
                },
                {
                  name: "browserGoBack",
                  description: "Navigates back to the previous webpage inside the current tab memory history.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "browserTabAction",
                  description: "Performs standard browser-tab actions: open new tab, close a tab, or switch index values.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Tab action instruction.",
                        enum: ["new", "close", "switch"]
                      },
                      tabId: {
                        type: Type.STRING,
                        description: "The tab identifier string if closing or switching."
                      },
                      url: {
                        type: Type.STRING,
                        description: "The initial starting URL if creating a new tab."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "changeBackground",
                  description: "Changes the visual theme or atmospheric glow color of Alya's interface.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      color: {
                        type: Type.STRING,
                        description: "The theme color name (violet, crimson, emerald, celestial, gold, rose, charcoal)"
                      }
                    },
                    required: ["color"]
                  }
                },
                {
                  name: "saveCustomMemory",
                  description: "Allows Alya to immediately save a piece of critical user information to her persistent memory core.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "The memory category.",
                        enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior", "tool_preference", "workflow", "communication_style"]
                      },
                      text: {
                        type: Type.STRING,
                        description: "Precise third-person statement."
                      }
                    },
                    required: ["category", "text"]
                  }
                },
                {
                  name: "createTask",
                  description: "Creates a persistent task in Alya's life memory system. Use this whenever the user gives an actionable request, todo, or work item.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Short task title." },
                      description: { type: Type.STRING, description: "Detailed description of what needs to be done." },
                      priority: { type: Type.STRING, description: "Task priority.", enum: ["low", "medium", "high", "critical"] },
                      deadline: { type: Type.STRING, description: "ISO 8601 deadline if mentioned (e.g. 2026-08-18T10:00:00Z)." },
                      projectId: { type: Type.STRING, description: "Related project ID if this belongs to a project." },
                      requiredComposioApp: { type: Type.STRING, description: "Name of Composio app required for this task (e.g. GMAIL, GITHUB, GOOGLEDRIVE)." }
                    },
                    required: ["title"]
                  }
                },
                {
                  name: "updateTaskStatus",
                  description: "Updates the status of an existing task in life memory. Use when task progress changes.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      taskId: { type: Type.STRING, description: "The task ID to update." },
                      status: { type: Type.STRING, description: "New task status.", enum: ["idea", "planned", "queued", "in_progress", "waiting_user", "waiting_external", "blocked", "completed", "failed", "cancelled"] },
                      notes: { type: Type.STRING, description: "Optional progress notes or error message." },
                      progress: { type: Type.INTEGER, description: "Progress percentage 0-100." }
                    },
                    required: ["taskId", "status"]
                  }
                },
                {
                  name: "setReminder",
                  description: "Sets a persistent reminder in Alya's life memory. Use when user says 'remind me', 'remember to', or any time-based intention.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING, description: "What to remind the user about." },
                      dueAt: { type: Type.STRING, description: "ISO 8601 datetime when to trigger (e.g. 2026-08-18T10:00:00Z)." },
                      recurrence: { type: Type.STRING, description: "How often to repeat.", enum: ["none", "daily", "weekly", "monthly", "weekdays"] },
                      relatedTaskId: { type: Type.STRING, description: "Related task ID if applicable." }
                    },
                    required: ["text", "dueAt"]
                  }
                },
                {
                  name: "scheduleEvent",
                  description: "Adds a calendar event or appointment to Alya's life schedule.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Event title." },
                      startAt: { type: Type.STRING, description: "ISO 8601 start datetime." },
                      endAt: { type: Type.STRING, description: "ISO 8601 end datetime (optional)." },
                      description: { type: Type.STRING, description: "Notes about the event." },
                      recurrence: { type: Type.STRING, description: "Recurrence pattern.", enum: ["none", "daily", "weekly", "monthly"] }
                    },
                    required: ["title", "startAt"]
                  }
                },
                {
                  name: "queryMemory",
                  description: "Searches Alya's life memory for projects, tasks, goals, or reminders matching a query. Use to retrieve context before answering questions about past work.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "Search query string." },
                      type: { type: Type.STRING, description: "Type to search.", enum: ["tasks", "projects", "goals", "reminders", "qa", "all"] }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "updateProjectStatus",
                  description: "Updates an existing project's status or progress in life memory.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      projectId: { type: Type.STRING, description: "Project ID to update." },
                      status: { type: Type.STRING, description: "New status.", enum: ["idea", "active", "paused", "blocked", "completed", "archived"] },
                      nextAction: { type: Type.STRING, description: "What should happen next on this project." },
                      currentState: { type: Type.STRING, description: "Brief description of current state." },
                      notes: { type: Type.STRING, description: "Additional notes to add to project." }
                    },
                    required: ["projectId"]
                  }
                },
                {
                  name: "recordGoalProgress",
                  description: "Records progress on a long-term goal.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      goalId: { type: Type.STRING, description: "Goal ID." },
                      progressPercent: { type: Type.INTEGER, description: "Progress percentage 0-100." },
                      milestone: { type: Type.STRING, description: "Milestone completed (optional)." },
                      notes: { type: Type.STRING, description: "Progress notes." }
                    },
                    required: ["goalId", "progressPercent"]
                  }
                },
                {
                  name: "rememberQA",
                  description: "Stores a question-answer pair in long-term Q&A memory. Use when you ask the user something meaningful and they answer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING, description: "The question you asked." },
                      answer: { type: Type.STRING, description: "The user's answer." },
                      context: { type: Type.STRING, description: "Brief context of the conversation." },
                      confidence: { type: Type.STRING, description: "How confident this answer will remain valid.", enum: ["low", "medium", "high"] }
                    },
                    required: ["question", "answer"]
                  }
                },
                {
                  name: "createProject",
                  description: "Creates a new project in Alya's persistent project memory.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: "Project name." },
                      purpose: { type: Type.STRING, description: "Project goal or purpose." },
                      tech: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Technologies/tools used." },
                      priority: { type: Type.STRING, enum: ["low", "medium", "high", "critical"] },
                      nextAction: { type: Type.STRING, description: "First action to take." },
                      composioAppsNeeded: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Composio apps needed (e.g. GITHUB, GMAIL)." }
                    },
                    required: ["name"]
                  }
                },
                {
                  name: "composioSearch",
                  description: "Searches Composio sessions for active tools by natural language query (e.g. 'Google Drive files', 'Gmail unread emails', 'GitHub repos'). Returns discovered tool slugs.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "Natural query term describing the task (e.g. 'Google Drive search files', 'Gmail list emails', 'GitHub user repos')."
                      }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "composioGetSchema",
                  description: "Retrieves full parameter input schema for a discovered Composio tool slug.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      tool_slug: {
                        type: Type.STRING,
                        description: "The discovered tool slug name."
                      }
                    },
                    required: ["tool_slug"]
                  }
                },
                {
                  name: "composioExecute",
                  description: "Executes a validated discovered Composio application action.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The discovered Composio action tool slug to execute (e.g. GOOGLEDRIVE_SEARCH_FILES, GMAIL_SEARCH_EMAILS)."
                      },
                      params: {
                        type: Type.OBJECT,
                        description: "Parameters object for the action."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "composioMultiExecute",
                  description: "Executes multiple independent Composio tool operations in parallel.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      toolCalls: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            actionName: { type: Type.STRING, description: "Tool action slug name." },
                            params: { type: Type.OBJECT, description: "Parameters for this call." }
                          },
                          required: ["actionName"]
                        },
                        description: "List of independent tool calls to execute in parallel."
                      }
                    },
                    required: ["toolCalls"]
                  }
                },
                {
                  name: "executeGoogleWorkspaceWorkflow",
                  description: "Executes a complete professional workflow for Google Docs, Google Sheets, or a full Google Workspace project package (Doc + Sheet + Drive Folder).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      workflowType: {
                        type: Type.STRING,
                        description: "The workflow category: 'doc' for Google Docs report, 'sheet' for Google Sheets, 'package' for full project package.",
                        enum: ["doc", "sheet", "package"]
                      },
                      title: { type: Type.STRING, description: "Title of the document, sheet, or project package." },
                      purpose: { type: Type.STRING, description: "Purpose or overview text." },
                      content: { type: Type.STRING, description: "Main body content or document sections." },
                      targetFolder: { type: Type.STRING, description: "Name of target Google Drive folder." },
                      headers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Spreadsheet header titles if creating a sheet." },
                      rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } }, description: "Data rows for spreadsheet." }
                    },
                    required: ["workflowType", "title"]
                  }
                },
                {
                  name: "fsListDir",
                  description: "Lists files and folders inside a specified directory path on the local computer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      dirPath: { type: Type.STRING, description: "Directory path to list (e.g. '.', 'C:/Users', project folder)." }
                    }
                  }
                },
                {
                  name: "fsReadFile",
                  description: "Reads the content of a local file (TXT, MD, JSON, CSV, PDF, DOCX, XLSX, source code, etc.).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      filePath: { type: Type.STRING, description: "Relative or absolute file path to read." }
                    },
                    required: ["filePath"]
                  }
                },
                {
                  name: "fsWriteFile",
                  description: "Creates, updates, or edits a local file on disk, verifies that the file was successfully saved, and updates project memory.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      filePath: { type: Type.STRING, description: "File path to save or update." },
                      content: { type: Type.STRING, description: "Exact text content to write into the file." },
                      preserveBackup: { type: Type.BOOLEAN, description: "Whether to create a .bak backup before overwriting (defaults to true)." }
                    },
                    required: ["filePath", "content"]
                  }
                },
                {
                  name: "fsMoveRename",
                  description: "Renames or moves a local file or directory.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      sourcePath: { type: Type.STRING, description: "Original file or directory path." },
                      destPath: { type: Type.STRING, description: "New file or directory path." }
                    },
                    required: ["sourcePath", "destPath"]
                  }
                },
                {
                  name: "fsSearchFiles",
                  description: "Recursively searches for files matching a keyword/pattern inside a directory.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      searchDir: { type: Type.STRING, description: "Directory path to search inside." },
                      pattern: { type: Type.STRING, description: "Filename search query or extension pattern." }
                    },
                    required: ["pattern"]
                  }
                },
                {
                  name: "appLaunch",
                  description: "Launches an installed Windows desktop application (VS Code, Chrome, Notepad, VLC, File Explorer, Calculator, etc.).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      appName: { type: Type.STRING, description: "Application name or alias (e.g. 'vscode', 'notepad', 'chrome', 'explorer')." },
                      targetFile: { type: Type.STRING, description: "Optional document file path or URL to open with the application." }
                    },
                    required: ["appName"]
                  }
                },
                {
                  name: "execTerminalCommand",
                  description: "Executes an approved terminal/shell command on the local machine with timeout, output capture, working directory control, and safety verification.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      command: { type: Type.STRING, description: "The terminal command line string to run." },
                      cwd: { type: Type.STRING, description: "Working directory (defaults to workspace root)." },
                      timeoutMs: { type: Type.INTEGER, description: "Maximum execution timeout in milliseconds (defaults to 30000)." },
                      confirmed: { type: Type.BOOLEAN, description: "Set to true if user explicitly confirmed execution of high-risk commands." }
                    },
                    required: ["command"]
                  }
                },
                {
                  name: "openMediaFile",
                  description: "Opens an audio, video, or image file using the default system player or viewer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      filePath: { type: Type.STRING, description: "Path to the media file to open." }
                    },
                    required: ["filePath"]
                  }
                },
                {
                  name: "analyzeProjectWorkspace",
                  description: "Inspects the authorized local project workspace directory, structure, technologies, key files, and configuration.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      workspacePath: { type: Type.STRING, description: "Path to the project workspace directory." }
                    }
                  }
                },
                {
                  name: "systemGetDrives",
                  description: "Inspects all logical drives and storage volumes connected to the laptop (C: drive, D: drive, USB drives) with total & free space.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "systemControlVolume",
                  description: "Adjusts master system audio volume on the laptop (set volume 0-100%, mute, unmute, volume up, volume down).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Volume action: 'set', 'mute', 'unmute', 'up', 'down'.",
                        enum: ["set", "mute", "unmute", "up", "down"]
                      },
                      level: {
                        type: Type.INTEGER,
                        description: "Target volume level 0 to 100 (only required if action is 'set')."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "systemGetStatus",
                  description: "Retrieves native laptop status: CPU info, RAM usage, uptime, OS info, and connected drives.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Audio Stream Chunk (model response audio play, 24kHz raw PCM)
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) {
              if (!isVoiceSpeakingThisTurn) {
                isVoiceSpeakingThisTurn = true;
                console.log("[VOICE_STARTED] Model audio streaming started to client.");
              }
              clientWs.send(JSON.stringify({ type: "audio", audio }));
              // Notify proactive engine that agent is speaking
              engine?.onAgentSpeaking();
            }

            // Interruption flag
            if (message.serverContent?.interrupted) {
              console.log("[Alya Interrupted!]");
              isVoiceSpeakingThisTurn = false;
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            // Turn Complete
            if (message.serverContent?.turnComplete) {
              if (isVoiceSpeakingThisTurn) {
                console.log("[VOICE_COMPLETED] Model audio turn complete.");
                isVoiceSpeakingThisTurn = false;
              }
              clientWs.send(JSON.stringify({ type: "turnComplete" }));

              if (currentModelResponseText.trim()) {
                dialogueHistory.push({ role: "model", text: currentModelResponseText });
                currentModelResponseText = "";
              }

              // Set task state to COMPLETED and notify engine
              engine?.setTaskState("TASK_COMPLETED", { taskName: "User Request" });
              engine?.onAgentFinishedSpeaking();

              // Non-blocking asynchronous memory extraction queue
              if (dialogueHistory.length >= 2) {
                setImmediate(async () => {
                  try {
                    const updated = await processConversationSlice(apiKey, dialogueHistory);
                    if (updated) {
                      console.log("[Memory Sync] Sending refreshed memory list to client.");
                      clientWs.send(JSON.stringify({ type: "memory_sync", memories: updated }));
                    }
                  } catch (err) {
                    console.error("[Memory Sync] Error running background consolidation:", err);
                  }

                  try {
                    const lifeUpdated = await processLifeMemoryFromConversation(apiKey, dialogueHistory);
                    if (lifeUpdated) {
                      console.log("[LifeMemory] Life context extracted, syncing to client.");
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db: lifeUpdated }));
                    }
                  } catch (err) {
                    console.error("[LifeMemory] Background extraction error:", err);
                  }
                });
              }
            }

            // Transcription of model output (text chunk)
            const modelText = (message.serverContent as any)?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
              clientWs.send(JSON.stringify({ type: "transcription", role: "model", text: modelText }));
              currentModelResponseText += modelText;
            }

            // User input transcription (user speech text translated by Gemini)
            const userTextOutput = (message.serverContent as any)?.userTurn?.parts?.[0]?.text;
            if (userTextOutput && !userTextOutput.includes("[PROACTIVE_TRIGGER]")) {
              clientWs.send(JSON.stringify({ type: "transcription", role: "user", text: userTextOutput }));
              dialogueHistory.push({ role: "user", text: userTextOutput });
              engine?.setTaskState("TASK_EXECUTING", { taskName: userTextOutput });
              engine?.onUserMessage(userTextOutput);
            }

            // Function Calls (Gemini requesting server/client tool execution)
            if (message.toolCall?.functionCalls) {
              engine?.onAgentSpeaking(); // Pause proactive timer while tools execute
              for (const fc of message.toolCall.functionCalls) {
                console.log(`[Function Call]: ${fc.name}`, fc.args);

                if (fc.name === "composioSearch") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const query = args.query || "";
                      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";

                      console.log(`[Alya Composio] Searching tools: "${query}"`);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: "thinking",
                        action: "composioSearch",
                        summary: `Searching tools for "${query}"...`
                      }));

                      const searchRes = await sessionManager.searchToolsInSession(entityId, query);
                      const primary = searchRes?.primaryToolSlugs || [];
                      const related = searchRes?.relatedToolSlugs || [];
                      const allDiscovered = Array.from(new Set([...primary, ...related]));

                      // Register discovered tools in toolRegistry
                      for (const slug of allDiscovered) {
                        const rawTk = slug.split("_")[0] || "composio";
                        toolRegistry.registerTool({
                          discoveredToolSlug: slug,
                          toolkitSlug: rawTk.toLowerCase(),
                          description: `${rawTk} tool: ${slug}`,
                          inputSchema: {},
                          requiresAuth: true,
                          connectedAccount: null,
                          riskLevel: classifyRiskLevel(slug),
                          sessionId: entityId,
                          discoveredAt: new Date().toISOString()
                        });
                        console.log(`[Alya Composio] Tool discovered: ${slug}`);
                      }

                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: true, query, primaryToolSlugs: primary, relatedToolSlugs: related, discoveredCount: allDiscovered.length } },
                            id: fc.id
                          }
                        ]
                      });
                    } catch (err: any) {
                      console.error("[Composio Search Error]:", err);
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: false, error: err.message } },
                            id: fc.id
                          }
                        ]
                      });
                    }
                  })();
                } else if (fc.name === "composioGetSchema") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const toolSlug = args.tool_slug || "";
                      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";

                      console.log(`[Alya Composio] Getting schema for: ${toolSlug}`);
                      const res = await sessionManager.executeTool("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: [toolSlug] }, entityId, true);

                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: true, toolSlug, schema: res.data?.schemas?.[toolSlug] || res.data || {} } },
                            id: fc.id
                          }
                        ]
                      });
                    } catch (err: any) {
                      console.error("[Composio Schema Error]:", err);
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: false, error: err.message } },
                            id: fc.id
                          }
                        ]
                      });
                    }
                  })();
                } else if (fc.name === "composioExecute") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const actionName = args.action || args.tool_slug;
                      const params = args.params || args.arguments || {};
                      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";

                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: "thinking",
                        action: actionName,
                        summary: `Executing ${actionName}...`
                      }));

                      const result = await executeComposioAction(actionName, params, entityId);

                      if (result.requiresConfirmation) {
                        clientWs.send(JSON.stringify({
                          type: "composioConfirmationRequired",
                          callId: fc.id,
                          action: actionName,
                          params,
                          confirmationMessage: result.confirmationMessage || `Are you sure you want to execute ${actionName}?`
                        }));
                        clientWs.send(JSON.stringify({
                          type: "agent_activity",
                          status: "awaiting_confirmation",
                          action: actionName,
                          summary: `Waiting for confirmation to run ${actionName}`
                        }));
                      } else if (result.redirectUrl) {
                        const appName = (actionName.split("_")[0] || "app").toUpperCase();
                        console.log(`[Composio Unconnected App] ${actionName} requires sign-in URL: ${result.redirectUrl}`);

                        clientWs.send(JSON.stringify({
                          type: "composioConnectRequired",
                          action: actionName,
                          appName,
                          redirectUrl: result.redirectUrl,
                          message: result.error || `Connection to ${appName} is required.`
                        }));

                        clientWs.send(JSON.stringify({
                          type: "agent_activity",
                          status: "error",
                          action: actionName,
                          summary: `Connection required for ${appName}. Sign-in tab opened!`,
                          redirectUrl: result.redirectUrl
                        }));

                        session.sendToolResponse({
                          functionResponses: [
                            {
                              name: fc.name,
                              response: { output: { success: false, error: `Connection to ${appName} is required. Sign-in tab opened for user in Chrome.`, redirectUrl: result.redirectUrl } },
                              id: fc.id
                            }
                          ]
                        });
                      } else {
                        console.log(`[Alya Composio] Returned result to Alya (${result.items?.length || 0} items)`);
                        clientWs.send(JSON.stringify({
                          type: "agent_activity",
                          status: result.success ? "success" : "error",
                          action: actionName,
                          summary: result.success ? `Executed ${actionName} successfully` : `Failed: ${result.error}`
                        }));

                        session.sendToolResponse({
                          functionResponses: [
                            {
                              name: fc.name,
                              response: { output: result },
                              id: fc.id
                            }
                          ]
                        });
                      }
                    } catch (err: any) {
                      console.error("[Composio Tool Execution Error]:", err);
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: false, error: err.message } },
                            id: fc.id
                          }
                        ]
                      });
                    }
                  })();
                } else if (fc.name === "composioMultiExecute") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const toolCalls = args.toolCalls || [];
                      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";

                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: "thinking",
                        action: "composioMultiExecute",
                        summary: `Running parallel batch of ${toolCalls.length} actions...`
                      }));

                      const results = await multiExecuteComposioActions(toolCalls, entityId);

                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: "success",
                        action: "composioMultiExecute",
                        summary: `Parallel execution completed (${results.filter(r => r.success).length}/${results.length} succeeded)`
                      }));

                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: true, count: results.length, results } },
                            id: fc.id
                          }
                        ]
                      });
                    } catch (err: any) {
                      console.error("[Composio Multi-Execute Error]:", err);
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: false, error: err.message } },
                            id: fc.id
                          }
                        ]
                      });
                    }
                  })();
                } else if (fc.name === "executeGoogleWorkspaceWorkflow") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const workflowType = args.workflowType || "doc";
                      const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";

                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: "thinking",
                        action: "executeGoogleWorkspaceWorkflow",
                        summary: `Running Google Workspace workflow (${workflowType}): "${args.title}"...`
                      }));

                      let result;
                      if (workflowType === "doc") {
                        result = await executeGoogleDocWorkflow({ ...args, entityId });
                      } else if (workflowType === "sheet") {
                        result = await executeGoogleSheetWorkflow({ ...args, entityId });
                      } else {
                        result = await executeFullWorkspacePackageWorkflow({ ...args, entityId, projectName: args.title, docTitle: `${args.title} Document` });
                      }

                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: result.success ? "success" : "error",
                        action: "executeGoogleWorkspaceWorkflow",
                        summary: result.message
                      }));

                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: result },
                            id: fc.id
                          }
                        ]
                      });
                    } catch (err: any) {
                      console.error("[Google Workspace Workflow Error]:", err);
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            name: fc.name,
                            response: { output: { success: false, error: err.message } },
                            id: fc.id
                          }
                        ]
                      });
                    }
                  })();
                } else if (fc.name === "saveCustomMemory") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const category = args.category;
                      const text = args.text;
                      if (category && text) {
                        const mList = await loadMemories();
                        const timestamp = new Date().toISOString();
                        const newMemory: Memory = {
                          id: Math.random().toString(36).substring(2, 11),
                          category,
                          text,
                          createdAt: timestamp,
                          updatedAt: timestamp
                        };
                        mList.push(newMemory);
                        await saveMemories(mList);
                        clientWs.send(JSON.stringify({ type: "memory_sync", memories: mList }));
                        session.sendToolResponse({
                          functionResponses: [{ name: fc.name, response: { output: { result: "Memory saved." } }, id: fc.id }]
                        });
                      }
                    } catch (err: any) {
                      console.error("saveCustomMemory execution failure:", err);
                    }
                  })();
                } else if (fc.name === "createTask") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      // Check Composio connection if needed
                      if (args.requiredComposioApp) {
                        const entityId = process.env.COMPOSIO_ENTITY_ID || "aryan";
                        try {
                          const apps = await getConnectedApps(entityId);
                          const app = apps.find((a: any) => (a.toolkitSlug || "").toUpperCase() === args.requiredComposioApp.toUpperCase());
                          args.composioAppConnected = app?.connected || false;
                          if (!args.composioAppConnected) {
                            const connResult = await initiateAppConnection(args.requiredComposioApp, entityId);
                            args.composioConnectUrl = connResult?.redirectUrl;
                            // Notify client to open auth link
                            if (args.composioConnectUrl) {
                              clientWs.send(JSON.stringify({
                                type: "composioConnectRequired",
                                action: `CONNECT_${args.requiredComposioApp}`,
                                appName: args.requiredComposioApp,
                                redirectUrl: args.composioConnectUrl,
                                message: `${args.requiredComposioApp} connection required for task: ${args.title}`
                              }));
                            }
                          }
                        } catch (connErr) {
                          args.composioAppConnected = false;
                        }
                      }
                      const task = await createTask(args);
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, task } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "updateTaskStatus") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const updates: any = { status: args.status };
                      if (args.notes) updates.errors = [args.notes];
                      if (args.progress !== undefined) updates.progress = args.progress;
                      const task = await updateTask(args.taskId, updates);
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, task } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "setReminder") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const reminder = await createReminder({
                        text: args.text,
                        dueAt: args.dueAt,
                        recurrence: args.recurrence || "none",
                        relatedTaskId: args.relatedTaskId,
                        timezone: "Asia/Karachi",
                        priority: "medium",
                      });
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, reminder } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "scheduleEvent") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const event = await createEvent(args);
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, event } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "queryMemory") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const type = args.type || "all";
                      const q = args.query || "";
                      let result: any = {};
                      if (type === "tasks" || type === "all") result.tasks = await searchTasks(q);
                      if (type === "projects" || type === "all") {
                        const allP = await listProjects();
                        result.projects = allP.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.purpose.toLowerCase().includes(q.toLowerCase()));
                      }
                      if (type === "goals" || type === "all") {
                        const allG = await listGoals();
                        result.goals = allG.filter(g => g.title.toLowerCase().includes(q.toLowerCase()));
                      }
                      if (type === "reminders" || type === "all") {
                        const allR = await listReminders();
                        result.reminders = allR.filter(r => r.text.toLowerCase().includes(q.toLowerCase()));
                      }
                      if (type === "qa" || type === "all") result.qa = await findQAByQuestion(q);
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, ...result } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "updateProjectStatus") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const updates: any = {};
                      if (args.status) updates.status = args.status;
                      if (args.nextAction) updates.nextAction = args.nextAction;
                      if (args.currentState) updates.currentState = args.currentState;
                      const project = await updateProject(args.projectId, updates);
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, project } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "recordGoalProgress") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const updates: any = { progress: args.progressPercent };
                      if (args.milestone) updates.milestones = [{ id: Date.now().toString(), title: args.milestone, completed: true, completedAt: new Date().toISOString() }];
                      const goal = await updateGoal(args.goalId, updates);
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, goal } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "rememberQA") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const qa = await addQAMemory({
                        question: args.question,
                        answer: args.answer,
                        context: args.context || "",
                        confidence: args.confidence || "medium",
                        askedAt: new Date().toISOString(),
                        answeredAt: new Date().toISOString(),
                      });
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, qa } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "createProject") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const project = await createProject(args);
                      const db = await getFullLifeMemoryDB();
                      clientWs.send(JSON.stringify({ type: "life_memory_sync", db }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: true, project } }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "fsListDir") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = localFsService.listDirectory(args.dirPath || ".");
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "fsListDir",
                        summary: res.success ? `Listed ${res.items.length} items in ${res.path}` : `Failed: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "fsReadFile") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = localFsService.readFile(args.filePath);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "fsReadFile",
                        summary: res.success ? `Read file "${res.fileName}" (${res.sizeBytes} bytes)` : `Failed reading file: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "fsWriteFile") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = localFsService.writeFile(args.filePath, args.content, args.preserveBackup !== false);
                      if (res.success) {
                        try {
                          await createTask({
                            title: `Modified local file: ${path.basename(args.filePath)}`,
                            description: `Saved ${res.bytesWritten} bytes to ${res.filePath}. Verified on disk: ${res.verifiedOnDisk}`,
                            priority: "medium"
                          });
                        } catch (_) {}
                      }
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "fsWriteFile",
                        summary: res.success ? `Saved file "${path.basename(args.filePath)}" (${res.bytesWritten} bytes verified)` : `Failed writing file: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "fsMoveRename") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = localFsService.moveOrRename(args.sourcePath, args.destPath);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "fsMoveRename",
                        summary: res.success ? `Moved ${path.basename(args.sourcePath)} -> ${path.basename(args.destPath)}` : `Failed: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "fsSearchFiles") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = localFsService.searchFiles(args.searchDir || ".", args.pattern);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "fsSearchFiles",
                        summary: res.success ? `Found ${res.results.length} files matching "${args.pattern}"` : `Failed: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "appLaunch") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = await appLauncherService.launchApp(args.appName, args.targetFile);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "appLaunch",
                        summary: res.message
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "execTerminalCommand") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = await terminalRunnerService.executeCommand(
                        args.command,
                        args.cwd,
                        args.timeoutMs || 30000,
                        args.confirmed === true
                      );
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "execTerminalCommand",
                        summary: res.success ? `Executed command: ${args.command}` : `Command failed: ${res.error || res.stderr}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "openMediaFile") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = await appLauncherService.openWithSystemDefault(args.filePath);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "openMediaFile",
                        summary: res.message
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "analyzeProjectWorkspace") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = localFsService.analyzeWorkspace(args.workspacePath || ".");
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "analyzeProjectWorkspace",
                        summary: res.success ? `Analyzed project: ${res.projectType} (${res.keyFiles.length} key files)` : `Failed: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "systemGetDrives") {
                  (async () => {
                    try {
                      const res = await systemControlService.getDrives();
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "systemGetDrives",
                        summary: res.success ? `Inspected ${res.drives.length} drives/disks on laptop` : `Failed: ${res.error}`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "systemControlVolume") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const res = await systemControlService.controlVolume(args.action, args.level);
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "systemControlVolume",
                        summary: res.message
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else if (fc.name === "systemGetStatus") {
                  (async () => {
                    try {
                      const res = await systemControlService.getSystemStatus();
                      clientWs.send(JSON.stringify({
                        type: "agent_activity",
                        status: res.success ? "success" : "error",
                        action: "systemGetStatus",
                        summary: `Inspected laptop system status (${res.status.hostname})`
                      }));
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: res }, id: fc.id }]
                      });
                    } catch (err: any) {
                      session.sendToolResponse({
                        functionResponses: [{ name: fc.name, response: { output: { success: false, error: err.message } }, id: fc.id }]
                      });
                    }
                  })();
                } else {
                  clientWs.send(JSON.stringify({
                    type: "toolCall",
                    callId: fc.id,
                    name: fc.name,
                    args: fc.args
                  }));
                }
              }
            }
          },
          onclose: () => {
            console.log("Gemini Live session closed");
            clientWs.send(JSON.stringify({ type: "status", status: "session_closed" }));
          }
        }
      });

      clientWs.send(JSON.stringify({ type: "status", status: "connected" }));

      // ── Initialize Proactive Conversation Engine ───────────────────────────
      engine = new ProactiveEngine({
        apiKey,
        getContext: async () => {
          try {
            const db = await getFullLifeMemoryDB();
            const memories = await loadMemories();
            const nowMs = Date.now();
            const twoHoursMs = 2 * 60 * 60 * 1000;
            return {
              activeTasks: (db.tasks || []).filter((t: any) =>
                ["in_progress", "planned", "queued"].includes(t.status)
              ),
              activeProjects: (db.projects || []).filter((p: any) =>
                ["active", "idea"].includes(p.status)
              ),
              dueReminders: (db.reminders || []).filter((r: any) => {
                if (r.status !== "scheduled") return false;
                const due = new Date(r.dueAt).getTime();
                return due >= nowMs - 60_000 && due <= nowMs + twoHoursMs;
              }),
              recentQA: (db.qaMemory || [])
                .filter((qa: any) => qa.stillValid !== false)
                .slice(-10),
              goals: (db.goals || []).filter((g: any) => g.status === "active"),
              memories: (memories || []).slice(-20),
              recentDialogue: dialogueHistory.slice(-8),
            };
          } catch (ctxErr: any) {
            console.error("[Proactive] Context load error:", ctxErr.message);
            return {
              activeTasks: [], activeProjects: [], dueReminders: [],
              recentQA: [], memories: [], goals: [], recentDialogue: []
            };
          }
        },
        onDeliver: (question: string) => {
          // Inject the proactive question into the Gemini Live session
          // The model will speak it naturally in audio
          if (clientWs.readyState === 1 /* OPEN */) {
            try {
              console.log(`[Proactive] Injecting into Live session: "${question}"`);
              (session as any).sendClientContent({
                turns: [
                  {
                    role: "user",
                    parts: [{ text: `[PROACTIVE_TRIGGER] ${question}` }],
                  },
                ],
                turnComplete: true,
              });
              // Also notify the UI that a proactive question was sent
              clientWs.send(
                JSON.stringify({
                  type: "proactive_question_sent",
                  question,
                })
              );
            } catch (deliveryErr: any) {
              console.error("[Proactive] Delivery failed:", deliveryErr.message);
            }
          }
        },
        onStateChange: (state: ProactiveState) => {
          // Broadcast state change to client so UI can update indicator
          if (clientWs.readyState === 1 /* OPEN */) {
            try {
              clientWs.send(
                JSON.stringify({ type: "proactive_state_change", state })
              );
            } catch (_) {}
          }
        },
        onLog: (msg: string) => console.log(msg),
      });
      console.log("[Proactive] Engine attached to session.");

      clientWs.on("message", (rawMsg) => {
        try {
          const msg = JSON.parse(rawMsg.toString());
          if (msg.audio) {
            engine?.onUserActivity();
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" }
            });
          } else if (msg.type === "video" && msg.video) {
            session.sendRealtimeInput({
              video: { data: msg.video, mimeType: "image/jpeg" }
            });
          } else if (msg.type === "toolResponse") {
            session.sendToolResponse({
              functionResponses: [
                {
                  name: msg.name,
                  response: { output: msg.output },
                  id: msg.id
                }
              ]
            });
          } else if (msg.type === "user_activity") {
            // Client reports user activity (mouse/keyboard) — reset inactivity timer
            engine?.onUserActivity();
          }
        } catch (e) {
          console.error("Error editing/forwarding client frame message:", e);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected, closing Gemini session");
        // Destroy proactive engine first to clear all timers
        engine?.destroy();
        engine = null;
        try {
          session.close();
        } catch (e) { }
      });

    } catch (err: any) {
      console.error("Error connecting to Gemini Live API:", err);
      clientWs.send(JSON.stringify({
        type: "error",
        error: `Could not connect to Gemini: ${err.message || err}`
      }));
      clientWs.close();
    }
  });

  // Serve custom static assets folder if present
  const customAssetsDir = path.join(APP_ROOT, "assets");
  if (existsSync(customAssetsDir)) {
    app.use("/assets", express.static(customAssetsDir));
  }

  // Express Static assets / Vite Dev Middleware configuration
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/memories.json', '**/metadata.json', '**/*.json']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log(`[Server] Serving production static files from: ${DIST_DIR}`);
    app.use(express.static(DIST_DIR));
    app.get('*', (req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  // ──────────────────────────────────────────────────────────
  // Background Reminder Checker — polls every 60 seconds
  // ──────────────────────────────────────────────────────────
  const activeWebSocketClients = new Set<any>();
  wss.on("connection", (ws) => {
    activeWebSocketClients.add(ws);
    ws.on("close", () => activeWebSocketClients.delete(ws));
  });

  setInterval(async () => {
    try {
      const triggered = await checkDueReminders();
      if (triggered.length > 0) {
        console.log(`[Reminders] ${triggered.length} reminder(s) triggered`);
        const db = await getFullLifeMemoryDB();
        for (const client of activeWebSocketClients) {
          try {
            for (const rem of triggered) {
              client.send(JSON.stringify({ type: "reminder_triggered", reminder: rem }));
            }
            client.send(JSON.stringify({ type: "life_memory_sync", db }));
          } catch (err) { /* client disconnected */ }
        }
      }
    } catch (err) {
      console.error("[Reminder Check] Error:", err);
    }
  }, 60_000);

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Server Error] Port ${PORT} is already in use by another running process (e.g. Alya AI Agent or another server instance).`);
      console.error(`[Server Error] Please stop the process using port ${PORT} or specify PORT in your environment (e.g. PORT=3001).`);
    } else {
      console.error("[Server Error]", err);
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server startup sequence:", error);
});
