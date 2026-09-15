/**
 * server_life_memory.ts
 * ──────────────────────────────────────────────────────────────
 * Alya Life Memory Engine — Persistent structured intelligence
 * for Projects, Tasks, Reminders, Calendar, Goals, Q&A Memory,
 * Knowledge Graph, and Composio app connection tracking.
 *
 * All data is stored in life_memory.json at project root.
 * This module is 100% additive — the existing memories.json
 * and server_memory.ts are not affected.
 * ──────────────────────────────────────────────────────────────
 */

import fs from "fs/promises";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import {
  LifeMemoryDB,
  Project,
  Task,
  Reminder,
  CalendarEvent,
  Goal,
  QAMemory,
  KnowledgeNode,
  KnowledgeEdge,
  ComposioConnectionRecord,
  ProjectStatus,
  TaskStatus,
  ReminderStatus,
  Priority,
  ReminderRecurrence,
  QAConfidence,
  LifeMemoryTransaction,
  GoalStatus,
  ExternalResource,
} from "./src/lib/memoryTypes";

import { existsSync, mkdirSync, copyFileSync } from "fs";

function resolveDataFilePath(filename: string): string {
  const baseDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, "AlyaAIAgent")
    : (process.env.HOME ? path.join(process.env.HOME, ".alya-ai-agent") : process.cwd());

  try {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    const userPath = path.join(baseDir, filename);
    if (!existsSync(userPath)) {
      const defaultPath = path.join(process.cwd(), filename);
      if (existsSync(defaultPath)) {
        copyFileSync(defaultPath, userPath);
      }
    }
    return userPath;
  } catch (e) {
    return path.join(process.cwd(), filename);
  }
}

const LIFE_MEMORY_FILE = resolveDataFilePath("life_memory.json");

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────
// Load / Save
// ─────────────────────────────────────────────────────────────
const EMPTY_DB: LifeMemoryDB = {
  projects: [],
  tasks: [],
  reminders: [],
  events: [],
  goals: [],
  qaMemory: [],
  knowledgeGraph: { nodes: [], edges: [] },
  composioConnections: [],
  lastUpdated: "",
};

// Serialization Mutex queue to prevent concurrent read/write race conditions
let lifeMemoryFileLock: Promise<any> = Promise.resolve();

export async function loadLifeMemory(): Promise<LifeMemoryDB> {
  return new Promise((resolve) => {
    lifeMemoryFileLock = lifeMemoryFileLock.then(async () => {
      try {
        const data = await fs.readFile(LIFE_MEMORY_FILE, "utf-8");
        const parsed = JSON.parse(data) as LifeMemoryDB;
        resolve({
          projects: parsed.projects || [],
          tasks: parsed.tasks || [],
          reminders: parsed.reminders || [],
          events: parsed.events || [],
          goals: parsed.goals || [],
          qaMemory: parsed.qaMemory || [],
          knowledgeGraph: parsed.knowledgeGraph || { nodes: [], edges: [] },
          composioConnections: parsed.composioConnections || [],
          lastUpdated: parsed.lastUpdated || "",
        });
      } catch (err: any) {
        if (err.code === "ENOENT") {
          const fresh = { ...EMPTY_DB, lastUpdated: now() };
          await atomicWriteJSON(LIFE_MEMORY_FILE, fresh);
          resolve(fresh);
          return;
        }
        console.error("[LifeMemory] Load error (recovering clean DB):", err.message || err);
        const cleanDB = { ...EMPTY_DB, lastUpdated: now() };
        await atomicWriteJSON(LIFE_MEMORY_FILE, cleanDB);
        resolve(cleanDB);
      }
    });
  });
}

export async function saveLifeMemory(db: LifeMemoryDB): Promise<void> {
  return new Promise((resolve) => {
    lifeMemoryFileLock = lifeMemoryFileLock.then(async () => {
      try {
        db.lastUpdated = now();
        await atomicWriteJSON(LIFE_MEMORY_FILE, db);
      } catch (err) {
        console.error("[LifeMemory] Save error:", err);
      }
      resolve();
    });
  });
}

async function atomicWriteJSON(filePath: string, data: any): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

// ─────────────────────────────────────────────────────────────
// PROJECT CRUD
// ─────────────────────────────────────────────────────────────
export async function createProject(data: Partial<Project>): Promise<Project> {
  const db = await loadLifeMemory();
  const project: Project = {
    id: generateId("proj"),
    name: data.name || "Unnamed Project",
    purpose: data.purpose || "",
    status: data.status || "active",
    tech: data.tech || [],
    decisions: data.decisions || [],
    milestones: data.milestones || [],
    completedWork: data.completedWork || [],
    pendingWork: data.pendingWork || [],
    blockers: data.blockers || [],
    files: data.files || [],
    links: data.links || [],
    deadline: data.deadline,
    priority: data.priority || "medium",
    currentState: data.currentState || "",
    nextAction: data.nextAction || "",
    previousAttempts: data.previousAttempts || [],
    composioAppsUsed: data.composioAppsUsed || [],
    composioAppsNeeded: data.composioAppsNeeded || [],
    createdAt: now(),
    updatedAt: now(),
  };
  db.projects.push(project);

  // Add knowledge graph node
  db.knowledgeGraph.nodes.push({
    id: generateId("kn"),
    type: "project",
    label: project.name,
    entityId: project.id,
    createdAt: now(),
  });

  await saveLifeMemory(db);
  return project;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const db = await loadLifeMemory();
  const idx = db.projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.projects[idx] = { ...db.projects[idx], ...updates, id, updatedAt: now() };
  await saveLifeMemory(db);
  return db.projects[idx];
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await loadLifeMemory();
  return db.projects.find((p) => p.id === id) || null;
}

export async function findProjectByName(name: string): Promise<Project | null> {
  const db = await loadLifeMemory();
  const lower = name.toLowerCase();
  return (
    db.projects.find((p) => p.name.toLowerCase().includes(lower)) || null
  );
}

export async function listProjects(status?: ProjectStatus): Promise<Project[]> {
  const db = await loadLifeMemory();
  return status ? db.projects.filter((p) => p.status === status) : db.projects;
}

// ─────────────────────────────────────────────────────────────
// TASK CRUD
// ─────────────────────────────────────────────────────────────
export async function createTask(data: Partial<Task>): Promise<Task> {
  const db = await loadLifeMemory();

  // Check Composio connection if app is required
  let composioAppConnected = true;
  let composioConnectUrl: string | undefined;
  if (data.requiredComposioApp) {
    const conn = db.composioConnections.find(
      (c) => c.appName === data.requiredComposioApp
    );
    composioAppConnected = conn?.connected ?? false;
    if (!composioAppConnected && data.composioConnectUrl) {
      composioConnectUrl = data.composioConnectUrl;
    }
  }

  const task: Task = {
    id: generateId("task"),
    projectId: data.projectId,
    title: data.title || "Unnamed Task",
    description: data.description || "",
    status: data.status || "planned",
    priority: data.priority || "medium",
    dependencies: data.dependencies || [],
    deadline: data.deadline,
    progress: data.progress || 0,
    attempts: data.attempts || [],
    toolActions: data.toolActions || [],
    errors: data.errors || [],
    nextAction: data.nextAction || "",
    tags: data.tags || [],
    requiredComposioApp: data.requiredComposioApp,
    composioAppConnected,
    composioConnectUrl,
    createdAt: now(),
    updatedAt: now(),
  };
  db.tasks.push(task);

  // Link to project if provided
  if (task.projectId) {
    const projIdx = db.projects.findIndex((p) => p.id === task.projectId);
    if (projIdx !== -1 && task.title) {
      db.projects[projIdx].pendingWork.push(task.title);
      db.projects[projIdx].updatedAt = now();
    }
  }

  // Add knowledge graph node + edge
  const tn = generateId("kn");
  db.knowledgeGraph.nodes.push({
    id: tn,
    type: "task",
    label: task.title,
    entityId: task.id,
    createdAt: now(),
  });
  if (task.projectId) {
    const projNode = db.knowledgeGraph.nodes.find(
      (n) => n.entityId === task.projectId
    );
    if (projNode) {
      db.knowledgeGraph.edges.push({
        id: generateId("ke"),
        fromNodeId: tn,
        toNodeId: projNode.id,
        relation: "PART_OF",
        createdAt: now(),
      });
    }
  }

  await saveLifeMemory(db);
  return task;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const db = await loadLifeMemory();
  const idx = db.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const prev = db.tasks[idx];

  // If completing a task, move it from pendingWork to completedWork in project
  if (
    updates.status === "completed" &&
    prev.status !== "completed" &&
    prev.projectId
  ) {
    const projIdx = db.projects.findIndex((p) => p.id === prev.projectId);
    if (projIdx !== -1) {
      const proj = db.projects[projIdx];
      proj.pendingWork = proj.pendingWork.filter((w) => w !== prev.title);
      if (!proj.completedWork.includes(prev.title)) {
        proj.completedWork.push(prev.title);
      }
      proj.updatedAt = now();
    }
  }

  db.tasks[idx] = { ...prev, ...updates, id, updatedAt: now() };
  await saveLifeMemory(db);
  return db.tasks[idx];
}

export async function getTask(id: string): Promise<Task | null> {
  const db = await loadLifeMemory();
  return db.tasks.find((t) => t.id === id) || null;
}

export async function listTasks(options?: {
  status?: TaskStatus;
  projectId?: string;
  priority?: Priority;
}): Promise<Task[]> {
  const db = await loadLifeMemory();
  return db.tasks.filter((t) => {
    if (options?.status && t.status !== options.status) return false;
    if (options?.projectId && t.projectId !== options.projectId) return false;
    if (options?.priority && t.priority !== options.priority) return false;
    return true;
  });
}

export async function searchTasks(query: string): Promise<Task[]> {
  const db = await loadLifeMemory();
  const q = query.toLowerCase();
  return db.tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

// ─────────────────────────────────────────────────────────────
// REMINDER CRUD
// ─────────────────────────────────────────────────────────────
export async function createReminder(data: Partial<Reminder>): Promise<Reminder> {
  const db = await loadLifeMemory();
  const reminder: Reminder = {
    id: generateId("rem"),
    text: data.text || "Reminder",
    dueAt: data.dueAt || now(),
    recurrence: data.recurrence || "none",
    status: "scheduled",
    relatedTaskId: data.relatedTaskId,
    relatedProjectId: data.relatedProjectId,
    priority: data.priority || "medium",
    snoozedUntil: undefined,
    timezone: data.timezone || "Asia/Karachi",
    createdAt: now(),
    updatedAt: now(),
  };
  db.reminders.push(reminder);
  await saveLifeMemory(db);
  return reminder;
}

export async function updateReminder(id: string, updates: Partial<Reminder>): Promise<Reminder | null> {
  const db = await loadLifeMemory();
  const idx = db.reminders.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  db.reminders[idx] = { ...db.reminders[idx], ...updates, id, updatedAt: now() };
  await saveLifeMemory(db);
  return db.reminders[idx];
}

export async function listReminders(status?: ReminderStatus): Promise<Reminder[]> {
  const db = await loadLifeMemory();
  return status ? db.reminders.filter((r) => r.status === status) : db.reminders;
}

/**
 * Check for due reminders and return ones that should be triggered now.
 * Marks them as "triggered" and handles recurrence scheduling.
 */
export async function checkDueReminders(): Promise<Reminder[]> {
  const db = await loadLifeMemory();
  const nowTs = Date.now();
  const triggered: Reminder[] = [];

  for (const rem of db.reminders) {
    if (rem.status !== "scheduled") continue;

    // Handle snoozed: use snoozedUntil as effective due time
    const effectiveDue = rem.snoozedUntil
      ? new Date(rem.snoozedUntil).getTime()
      : new Date(rem.dueAt).getTime();

    if (effectiveDue <= nowTs) {
      triggered.push(rem);
      const idx = db.reminders.findIndex((r) => r.id === rem.id);

      if (rem.recurrence && rem.recurrence !== "none") {
        // Reschedule for next occurrence
        const nextDue = calculateNextRecurrence(rem.dueAt, rem.recurrence);
        db.reminders[idx] = {
          ...rem,
          dueAt: nextDue,
          snoozedUntil: undefined,
          notifiedAt: now(),
          updatedAt: now(),
        };
      } else {
        db.reminders[idx] = {
          ...rem,
          status: "triggered",
          notifiedAt: now(),
          snoozedUntil: undefined,
          updatedAt: now(),
        };
      }
    }
  }

  if (triggered.length > 0) {
    await saveLifeMemory(db);
  }
  return triggered;
}

function calculateNextRecurrence(dueAt: string, recurrence: ReminderRecurrence): string {
  const d = new Date(dueAt);
  switch (recurrence) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "weekdays": {
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1);
      }
      break;
    }
    default:
      d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────
// CALENDAR EVENT CRUD
// ─────────────────────────────────────────────────────────────
export async function createEvent(data: Partial<CalendarEvent>): Promise<CalendarEvent> {
  const db = await loadLifeMemory();
  const event: CalendarEvent = {
    id: generateId("evt"),
    title: data.title || "Unnamed Event",
    description: data.description,
    startAt: data.startAt || now(),
    endAt: data.endAt,
    allDay: data.allDay || false,
    recurrence: data.recurrence || "none",
    location: data.location,
    relatedProjectId: data.relatedProjectId,
    relatedGoalId: data.relatedGoalId,
    notes: data.notes,
    createdAt: now(),
    updatedAt: now(),
  };
  db.events.push(event);
  await saveLifeMemory(db);
  return event;
}

export async function listEvents(options?: { from?: string; to?: string }): Promise<CalendarEvent[]> {
  const db = await loadLifeMemory();
  return db.events.filter((e) => {
    if (options?.from && e.startAt < options.from) return false;
    if (options?.to && e.startAt > options.to) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
// GOAL CRUD
// ─────────────────────────────────────────────────────────────
export async function createGoal(data: Partial<Goal>): Promise<Goal> {
  const db = await loadLifeMemory();
  const goal: Goal = {
    id: generateId("goal"),
    title: data.title || "Unnamed Goal",
    description: data.description || "",
    progress: data.progress || 0,
    milestones: data.milestones || [],
    linkedProjectIds: data.linkedProjectIds || [],
    linkedTaskIds: data.linkedTaskIds || [],
    deadline: data.deadline,
    status: data.status || "active",
    lastActivityAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  db.goals.push(goal);
  await saveLifeMemory(db);
  return goal;
}

export async function updateGoal(id: string, updates: Partial<Goal>): Promise<Goal | null> {
  const db = await loadLifeMemory();
  const idx = db.goals.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  db.goals[idx] = {
    ...db.goals[idx],
    ...updates,
    id,
    lastActivityAt: now(),
    updatedAt: now(),
  };
  await saveLifeMemory(db);
  return db.goals[idx];
}

export async function listGoals(status?: GoalStatus): Promise<Goal[]> {
  const db = await loadLifeMemory();
  return status ? db.goals.filter((g) => g.status === status) : db.goals;
}

// ─────────────────────────────────────────────────────────────
// Q&A MEMORY CRUD
// ─────────────────────────────────────────────────────────────
export async function addQAMemory(data: Partial<QAMemory>): Promise<QAMemory> {
  const db = await loadLifeMemory();

  // Check for duplicate question
  const existing = db.qaMemory.find(
    (qa) =>
      qa.question.toLowerCase().trim() === (data.question || "").toLowerCase().trim()
  );
  if (existing) {
    // Update existing instead of duplicating
    existing.answer = data.answer || existing.answer;
    existing.answeredAt = now();
    existing.confidence = data.confidence || existing.confidence;
    existing.stillValid = true;
    existing.updatedAt = now();
    await saveLifeMemory(db);
    return existing;
  }

  const qa: QAMemory = {
    id: generateId("qa"),
    question: data.question || "",
    answer: data.answer || "",
    askedAt: data.askedAt || now(),
    answeredAt: data.answeredAt || now(),
    confidence: data.confidence || "medium",
    stillValid: true,
    context: data.context || "",
    expiresAt: data.expiresAt,
    updatedAt: now(),
  };
  db.qaMemory.push(qa);
  await saveLifeMemory(db);
  return qa;
}

export async function findQAByQuestion(question: string): Promise<QAMemory | null> {
  const db = await loadLifeMemory();
  const q = question.toLowerCase().trim();
  return (
    db.qaMemory.find(
      (qa) =>
        qa.stillValid &&
        (qa.question.toLowerCase().includes(q) || q.includes(qa.question.toLowerCase().substring(0, 20)))
    ) || null
  );
}

export async function listQAMemory(): Promise<QAMemory[]> {
  const db = await loadLifeMemory();
  return db.qaMemory;
}

export async function markQAInvalid(id: string): Promise<void> {
  const db = await loadLifeMemory();
  const idx = db.qaMemory.findIndex((qa) => qa.id === id);
  if (idx !== -1) {
    db.qaMemory[idx].stillValid = false;
    db.qaMemory[idx].updatedAt = now();
    await saveLifeMemory(db);
  }
}

// ─────────────────────────────────────────────────────────────
// COMPOSIO CONNECTION TRACKING
// ─────────────────────────────────────────────────────────────
export async function syncComposioConnections(
  connectedApps: { appName: string; displayName: string; connected: boolean }[]
): Promise<void> {
  const db = await loadLifeMemory();

  for (const app of connectedApps) {
    const idx = db.composioConnections.findIndex((c) => c.appName === app.appName);
    if (idx === -1) {
      db.composioConnections.push({
        appName: app.appName,
        displayName: app.displayName,
        connected: app.connected,
        connectedAt: app.connected ? now() : undefined,
        usedInProjects: [],
        usedInTasks: [],
        lastUsedAt: undefined,
      });
    } else {
      const wasConnected = db.composioConnections[idx].connected;
      db.composioConnections[idx].connected = app.connected;
      if (!wasConnected && app.connected) {
        db.composioConnections[idx].connectedAt = now();
      }
    }
  }

  // Update tasks that have pending Composio app requirements
  for (const task of db.tasks) {
    if (task.requiredComposioApp) {
      const appConn = db.composioConnections.find(
        (c) => c.appName === task.requiredComposioApp
      );
      if (appConn) {
        const idx = db.tasks.findIndex((t) => t.id === task.id);
        if (idx !== -1) {
          db.tasks[idx].composioAppConnected = appConn.connected;
          if (appConn.connected) {
            db.tasks[idx].composioConnectUrl = undefined;
          }
          db.tasks[idx].updatedAt = now();
        }
      }
    }
  }

  await saveLifeMemory(db);
}

export async function recordComposioAppUsed(
  appName: string,
  projectId?: string,
  taskId?: string
): Promise<void> {
  const db = await loadLifeMemory();
  const idx = db.composioConnections.findIndex((c) => c.appName === appName);
  if (idx !== -1) {
    db.composioConnections[idx].lastUsedAt = now();
    if (projectId && !db.composioConnections[idx].usedInProjects.includes(projectId)) {
      db.composioConnections[idx].usedInProjects.push(projectId);
    }
    if (taskId && !db.composioConnections[idx].usedInTasks.includes(taskId)) {
      db.composioConnections[idx].usedInTasks.push(taskId);
    }
    await saveLifeMemory(db);
  }
}

// ─────────────────────────────────────────────────────────────
// CONTEXTUAL RETRIEVAL
// ─────────────────────────────────────────────────────────────

/**
 * Get a rich context summary string for injecting into the Gemini
 * system instructions at the start of each session.
 */
export async function getContextSummary(): Promise<string> {
  const db = await loadLifeMemory();

  const activeProjects = db.projects.filter(
    (p) => p.status === "active" || p.status === "paused"
  );
  const pendingTasks = db.tasks.filter(
    (t) =>
      t.status === "in_progress" ||
      t.status === "planned" ||
      t.status === "queued" ||
      t.status === "blocked"
  );
  const upcomingReminders = db.reminders
    .filter((r) => r.status === "scheduled")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 5);
  const activeGoals = db.goals.filter((g) => g.status === "active");
  const recentQA = db.qaMemory.filter((qa) => qa.stillValid).slice(-5);
  const disconnectedTaskApps = db.tasks
    .filter((t) => t.requiredComposioApp && !t.composioAppConnected)
    .map((t) => t.requiredComposioApp);

  let summary = "\n\n=== ALYA LIFE MEMORY CONTEXT ===\n";

  if (activeProjects.length > 0) {
    summary += "\n📁 ACTIVE PROJECTS:\n";
    activeProjects.forEach((p) => {
      summary += `  • [${p.status.toUpperCase()}] "${p.name}" — ${p.purpose || "No purpose set"}\n`;
      if (p.nextAction) summary += `    Next: ${p.nextAction}\n`;
      if (p.blockers.length > 0)
        summary += `    Blocker: ${p.blockers[p.blockers.length - 1]}\n`;
    });
  }

  if (pendingTasks.length > 0) {
    summary += "\n✅ PENDING TASKS:\n";
    pendingTasks.slice(0, 8).forEach((t) => {
      summary += `  • [${t.status}] "${t.title}" (${t.priority} priority)`;
      if (t.deadline) summary += ` — due ${new Date(t.deadline).toLocaleDateString()}`;
      if (t.requiredComposioApp && !t.composioAppConnected) {
        summary += ` ⚠️ needs ${t.requiredComposioApp} connection`;
      }
      summary += "\n";
    });
  }

  if (upcomingReminders.length > 0) {
    summary += "\n🔔 UPCOMING REMINDERS:\n";
    upcomingReminders.forEach((r) => {
      summary += `  • "${r.text}" — due ${new Date(r.dueAt).toLocaleString()}\n`;
    });
  }

  if (activeGoals.length > 0) {
    summary += "\n🎯 ACTIVE GOALS:\n";
    activeGoals.forEach((g) => {
      summary += `  • "${g.title}" — ${g.progress}% complete\n`;
    });
  }

  if (recentQA.length > 0) {
    summary += "\n💬 REMEMBERED Q&A:\n";
    recentQA.forEach((qa) => {
      summary += `  • Q: "${qa.question}"\n    A: "${qa.answer}"\n`;
    });
  }

  if (disconnectedTaskApps.length > 0) {
    summary += `\n⚡ TASKS NEED APP CONNECTIONS: ${[...new Set(disconnectedTaskApps)].join(", ")}\n`;
    summary += "  → Offer to connect these apps when relevant tasks are discussed.\n";
  }

  summary +=
    "\nINSTRUCTIONS FOR USING LIFE MEMORY:\n" +
    "- Integrate this knowledge naturally into conversation — never quote it robotically.\n" +
    "- Reference active projects when the user mentions related work.\n" +
    "- Use createTask when user gives an actionable request.\n" +
    "- Use setReminder when user mentions time-based intentions.\n" +
    "- Use queryMemory to look up stored info before asking the user.\n" +
    "- If a task needs a disconnected app, proactively offer to connect it.\n" +
    "- Never ask a question you already have the answer to in Q&A memory.\n" +
    "=====================================\n";

  return summary;
}

// ─────────────────────────────────────────────────────────────
// DAILY PLAN
// ─────────────────────────────────────────────────────────────
export async function generateDailyPlan(): Promise<{
  date: string;
  urgentTasks: Task[];
  scheduledReminders: Reminder[];
  todayEvents: CalendarEvent[];
  suggestions: string[];
}> {
  const db = await loadLifeMemory();
  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const urgentTasks = db.tasks
    .filter(
      (t) =>
        t.status !== "completed" &&
        t.status !== "cancelled" &&
        t.status !== "archived" &&
        (t.priority === "critical" ||
          t.priority === "high" ||
          (t.deadline && t.deadline.startsWith(todayStr)) ||
          (t.deadline && t.deadline.startsWith(tomorrowStr)))
    )
    .sort((a, b) => {
      const pOrder: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return pOrder[a.priority] - pOrder[b.priority];
    });

  const scheduledReminders = db.reminders.filter(
    (r) =>
      r.status === "scheduled" &&
      (r.dueAt.startsWith(todayStr) || r.dueAt.startsWith(tomorrowStr))
  );

  const todayEvents = db.events.filter((e) => e.startAt.startsWith(todayStr));

  const suggestions: string[] = [];
  if (urgentTasks.length > 0) {
    suggestions.push(
      `Focus on: "${urgentTasks[0].title}" (${urgentTasks[0].priority} priority)`
    );
  }
  const blockedTasks = db.tasks.filter((t) => t.status === "blocked");
  if (blockedTasks.length > 0) {
    suggestions.push(`${blockedTasks.length} task(s) are blocked — review and unblock them.`);
  }
  const overdueReminders = db.reminders.filter(
    (r) => r.status === "scheduled" && new Date(r.dueAt) < new Date()
  );
  if (overdueReminders.length > 0) {
    suggestions.push(`${overdueReminders.length} reminder(s) are overdue!`);
  }

  return { date: todayStr, urgentTasks, scheduledReminders, todayEvents, suggestions };
}

// ─────────────────────────────────────────────────────────────
// WEEKLY SUMMARY
// ─────────────────────────────────────────────────────────────
export async function generateWeeklySummary(): Promise<{
  completedTasks: Task[];
  pendingTasks: Task[];
  upcomingDeadlines: Task[];
  upcomingReminders: Reminder[];
  inactiveGoals: Goal[];
  activeProjects: Project[];
}> {
  const db = await loadLifeMemory();
  const nowMs = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const completedTasks = db.tasks.filter(
    (t) =>
      t.status === "completed" &&
      new Date(t.updatedAt).getTime() > nowMs - weekMs
  );

  const pendingTasks = db.tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "cancelled" &&
      t.status !== "archived"
  );

  const upcomingDeadlines = pendingTasks
    .filter((t) => t.deadline && new Date(t.deadline).getTime() < nowMs + weekMs)
    .sort(
      (a, b) =>
        new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
    );

  const upcomingReminders = db.reminders
    .filter(
      (r) =>
        r.status === "scheduled" &&
        new Date(r.dueAt).getTime() < nowMs + weekMs
    )
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  const inactiveGoals = db.goals.filter(
    (g) =>
      g.status === "active" &&
      new Date(g.lastActivityAt).getTime() < nowMs - weekMs * 2
  );

  const activeProjects = db.projects.filter(
    (p) => p.status === "active" || p.status === "paused"
  );

  return {
    completedTasks,
    pendingTasks,
    upcomingDeadlines,
    upcomingReminders,
    inactiveGoals,
    activeProjects,
  };
}

// ─────────────────────────────────────────────────────────────
// AI-POWERED LIFE MEMORY EXTRACTION FROM CONVERSATION
// ─────────────────────────────────────────────────────────────

let isLifeExtracting = false;

export async function processLifeMemoryFromConversation(
  apiKey: string,
  dialogueHistory: { role: string; text: string }[]
): Promise<LifeMemoryDB | null> {
  if (isLifeExtracting) return null;
  if (dialogueHistory.length < 1) return null;

  isLifeExtracting = true;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const db = await loadLifeMemory();
    const dialogueContext = dialogueHistory
      .map((l) => `${l.role === "user" ? "User" : "Alya"}: ${l.text}`)
      .join("\n");

    const projectSummary = db.projects
      .slice(-5)
      .map((p) => `ID:${p.id} Name:"${p.name}" Status:${p.status}`)
      .join("; ");
    const taskSummary = db.tasks
      .filter((t) => t.status !== "completed" && t.status !== "cancelled")
      .slice(-8)
      .map((t) => `ID:${t.id} Title:"${t.title}" Status:${t.status}`)
      .join("; ");

    const prompt = `You are Alya's life memory intelligence engine. Analyze the conversation and extract structured updates.

### EXISTING PROJECTS: ${projectSummary || "(none)"}
### EXISTING ACTIVE TASKS: ${taskSummary || "(none)"}

### RECENT CONVERSATION:
${dialogueContext}

Identify if any of the following occurred:
1. User mentioned a new project or updated status of an existing project
2. User gave an actionable task or todo
3. User set a reminder or time-based intention
4. User mentioned a goal or long-term aspiration
5. User answered a question that should be remembered for future conversations

Output ONLY a JSON array of transactions. If nothing meaningful happened, return [].
Rules:
- Only extract durable, actionable, meaningful information
- Do NOT extract passwords, API keys, secrets
- Do NOT duplicate existing projects/tasks — match by name if similar
- Be minimal — extract only what is clearly stated`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: [
                      "CREATE_PROJECT", "UPDATE_PROJECT",
                      "CREATE_TASK", "UPDATE_TASK",
                      "CREATE_REMINDER",
                      "CREATE_GOAL", "UPDATE_GOAL",
                      "ADD_QA_MEMORY",
                    ],
                  },
                  entityType: {
                    type: Type.STRING,
                    enum: ["project", "task", "reminder", "goal", "qa"],
                  },
                  id: { type: Type.STRING },
                  data: { type: Type.OBJECT },
                },
                required: ["action", "entityType", "data"],
              },
            },
          },
          required: ["transactions"],
        },
      },
    });

    const resultText = response.text?.trim() || "{}";
    const resultObj = JSON.parse(resultText);
    const transactions: LifeMemoryTransaction[] = resultObj.transactions || [];

    if (transactions.length === 0) {
      isLifeExtracting = false;
      return null;
    }

    console.log(`[LifeMemory] Processing ${transactions.length} life memory transactions`);

    for (const trx of transactions) {
      try {
        switch (trx.action) {
          case "CREATE_PROJECT": {
            const exists = await findProjectByName(trx.data.name || "");
            if (!exists) await createProject(trx.data);
            break;
          }
          case "UPDATE_PROJECT":
            if (trx.id) await updateProject(trx.id, trx.data);
            break;
          case "CREATE_TASK":
            await createTask(trx.data);
            break;
          case "UPDATE_TASK":
            if (trx.id) await updateTask(trx.id, trx.data);
            break;
          case "CREATE_REMINDER":
            await createReminder(trx.data);
            break;
          case "CREATE_GOAL":
            await createGoal(trx.data);
            break;
          case "UPDATE_GOAL":
            if (trx.id) await updateGoal(trx.id, trx.data);
            break;
          case "ADD_QA_MEMORY":
            await addQAMemory(trx.data);
            break;
        }
      } catch (err) {
        console.error(`[LifeMemory] Transaction error (${trx.action}):`, err);
      }
    }

    const updatedDB = await loadLifeMemory();
    isLifeExtracting = false;
    return updatedDB;
  } catch (err) {
    console.error("[LifeMemory] Extraction error:", err);
    isLifeExtracting = false;
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// FULL DB EXPORT (for client sync)
// ─────────────────────────────────────────────────────────────
export async function getFullLifeMemoryDB(): Promise<LifeMemoryDB> {
  return loadLifeMemory();
}

export async function clearCategory(
  category: "projects" | "tasks" | "reminders" | "events" | "goals" | "qaMemory"
): Promise<void> {
  const db = await loadLifeMemory();
  (db[category] as any[]) = [];
  await saveLifeMemory(db);
}

// ─────────────────────────────────────────────────────────────
// EXTERNAL RESOURCE TRACKING (Google Docs, Sheets, Drive Folders)
// ─────────────────────────────────────────────────────────────
export async function linkExternalResourceToTask(
  taskId: string,
  resourceData: Partial<ExternalResource>
): Promise<ExternalResource | null> {
  const db = await loadLifeMemory();
  const idx = db.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return null;

  const resource: ExternalResource = {
    id: resourceData.id || generateId("res"),
    resourceType: resourceData.resourceType || "generic",
    title: resourceData.title || "External Resource",
    url: resourceData.url,
    driveFolderId: resourceData.driveFolderId,
    driveFolderPath: resourceData.driveFolderPath,
    metadata: resourceData.metadata || {},
    createdAt: now(),
    updatedAt: now(),
  };

  if (!db.tasks[idx].externalResources) {
    db.tasks[idx].externalResources = [];
  }

  const existingResIdx = db.tasks[idx].externalResources!.findIndex((r) => r.id === resource.id);
  if (existingResIdx !== -1) {
    db.tasks[idx].externalResources![existingResIdx] = {
      ...db.tasks[idx].externalResources![existingResIdx],
      ...resource,
      updatedAt: now(),
    };
  } else {
    db.tasks[idx].externalResources!.push(resource);
  }

  db.tasks[idx].updatedAt = now();

  // If task belongs to a project, also link to project
  if (db.tasks[idx].projectId) {
    const projIdx = db.projects.findIndex((p) => p.id === db.tasks[idx].projectId);
    if (projIdx !== -1) {
      if (!db.projects[projIdx].externalResources) db.projects[projIdx].externalResources = [];
      const pResIdx = db.projects[projIdx].externalResources!.findIndex((r) => r.id === resource.id);
      if (pResIdx !== -1) {
        db.projects[projIdx].externalResources![pResIdx] = {
          ...db.projects[projIdx].externalResources![pResIdx],
          ...resource,
          updatedAt: now(),
        };
      } else {
        db.projects[projIdx].externalResources!.push(resource);
      }
      if (resource.url && !db.projects[projIdx].links.includes(resource.url)) {
        db.projects[projIdx].links.push(resource.url);
      }
    }
  }

  await saveLifeMemory(db);
  return resource;
}

export async function linkExternalResourceToProject(
  projectId: string,
  resourceData: Partial<ExternalResource>
): Promise<ExternalResource | null> {
  const db = await loadLifeMemory();
  const idx = db.projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;

  const resource: ExternalResource = {
    id: resourceData.id || generateId("res"),
    resourceType: resourceData.resourceType || "generic",
    title: resourceData.title || "External Resource",
    url: resourceData.url,
    driveFolderId: resourceData.driveFolderId,
    driveFolderPath: resourceData.driveFolderPath,
    metadata: resourceData.metadata || {},
    createdAt: now(),
    updatedAt: now(),
  };

  if (!db.projects[idx].externalResources) {
    db.projects[idx].externalResources = [];
  }

  const existingResIdx = db.projects[idx].externalResources!.findIndex((r) => r.id === resource.id);
  if (existingResIdx !== -1) {
    db.projects[idx].externalResources![existingResIdx] = {
      ...db.projects[idx].externalResources![existingResIdx],
      ...resource,
      updatedAt: now(),
    };
  } else {
    db.projects[idx].externalResources!.push(resource);
  }

  if (resource.url && !db.projects[idx].links.includes(resource.url)) {
    db.projects[idx].links.push(resource.url);
  }

  db.projects[idx].updatedAt = now();
  await saveLifeMemory(db);
  return resource;
}

export async function findExternalResourceByContext(
  contextQuery: string,
  resourceType?: string
): Promise<{ resource: ExternalResource; source: "task" | "project"; entityId: string } | null> {
  const db = await loadLifeMemory();
  const q = contextQuery.toLowerCase().trim();

  // Search tasks first (most recent)
  for (let i = db.tasks.length - 1; i >= 0; i--) {
    const task = db.tasks[i];
    if (task.externalResources && task.externalResources.length > 0) {
      for (let j = task.externalResources.length - 1; j >= 0; j--) {
        const res = task.externalResources[j];
        if (resourceType && res.resourceType !== resourceType) continue;
        if (
          !q ||
          res.title.toLowerCase().includes(q) ||
          task.title.toLowerCase().includes(q) ||
          q.includes("document") ||
          q.includes("file") ||
          q.includes("sheet") ||
          q.includes("created")
        ) {
          return { resource: res, source: "task", entityId: task.id };
        }
      }
    }
  }

  // Search projects next
  for (let i = db.projects.length - 1; i >= 0; i--) {
    const proj = db.projects[i];
    if (proj.externalResources && proj.externalResources.length > 0) {
      for (let j = proj.externalResources.length - 1; j >= 0; j--) {
        const res = proj.externalResources[j];
        if (resourceType && res.resourceType !== resourceType) continue;
        if (
          !q ||
          res.title.toLowerCase().includes(q) ||
          proj.name.toLowerCase().includes(q)
        ) {
          return { resource: res, source: "project", entityId: proj.id };
        }
      }
    }
  }

  return null;
}
