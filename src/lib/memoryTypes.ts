// ============================================================
// EXISTING MEMORY TYPES (unchanged)
// ============================================================

export interface Memory {
  id: string;
  category: "identity" | "preference" | "goal" | "project" | "relationship" | "emotional" | "behavior" | "tool_preference" | "workflow" | "communication_style";
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type MemoryCategory = Memory["category"];

export interface MemoryTransaction {
  action: "ADD" | "UPDATE" | "REMOVE";
  id: string;
  category: MemoryCategory;
  text: string;
}

// ============================================================
// LIFE MEMORY TYPES — NEW
// ============================================================

export type ProjectStatus = "idea" | "active" | "paused" | "blocked" | "completed" | "archived";
export type TaskStatus =
  | "idea"
  | "planned"
  | "queued"
  | "in_progress"
  | "waiting_user"
  | "waiting_external"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived"
  | "reopened";
export type ReminderStatus = "scheduled" | "triggered" | "completed" | "dismissed" | "snoozed" | "cancelled" | "missed";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type Priority = "low" | "medium" | "high" | "critical";
export type QAConfidence = "low" | "medium" | "high";

// ── Project ──────────────────────────────────────────────
export interface ProjectMilestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  dueDate?: string;
}

export interface ExternalResource {
  id: string;                    // e.g. Google Doc ID, Sheet ID, Drive Folder ID, GitHub Repo URL
  resourceType: "gdoc" | "gsheet" | "gdrive_folder" | "github_repo" | "github_issue" | "slack_thread" | "gmail_thread" | "generic";
  title: string;
  url?: string;
  driveFolderId?: string;
  driveFolderPath?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  purpose: string;
  status: ProjectStatus;
  tech: string[];
  decisions: string[];
  milestones: ProjectMilestone[];
  completedWork: string[];
  pendingWork: string[];
  blockers: string[];
  files: string[];
  links: string[];
  deadline?: string;
  priority: Priority;
  currentState: string;
  nextAction: string;
  previousAttempts: string[];
  // Composio: which apps are used/needed for this project
  composioAppsUsed: string[];             // e.g. ["GITHUB", "GOOGLEDRIVE"]
  composioAppsNeeded: string[];           // apps needed but not yet connected
  externalResources?: ExternalResource[]; // Tracked created Google Docs, Sheets, Drive Folders, etc.
  createdAt: string;
  updatedAt: string;
  lastConversationId?: string;
}

// ── Task ──────────────────────────────────────────────────
export interface TaskAttempt {
  attemptedAt: string;
  result: string;
  error?: string;
}

export interface Task {
  id: string;
  projectId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dependencies: string[];   // task IDs
  deadline?: string;
  progress: number;         // 0–100
  attempts: TaskAttempt[];
  toolActions: string[];    // history of tool calls made
  errors: string[];
  nextAction: string;
  tags: string[];
  // Composio integration: if task needs a specific connected app
  requiredComposioApp?: string;           // e.g. "GMAIL"
  composioAppConnected?: boolean;
  composioConnectUrl?: string;            // auto-populated auth link if not connected
  externalResources?: ExternalResource[]; // External resources created/modified by this task
  createdAt: string;
  updatedAt: string;
}

// ── Reminder ─────────────────────────────────────────────
export type ReminderRecurrence = "none" | "daily" | "weekly" | "monthly" | "weekdays";

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;            // ISO datetime string
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  relatedTaskId?: string;
  relatedProjectId?: string;
  priority: Priority;
  snoozedUntil?: string;
  timezone: string;         // e.g. "Asia/Karachi"
  notifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Calendar Event ────────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startAt: string;          // ISO datetime
  endAt?: string;           // ISO datetime
  allDay: boolean;
  recurrence: ReminderRecurrence;
  location?: string;
  relatedProjectId?: string;
  relatedGoalId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Goal ─────────────────────────────────────────────────
export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  dueDate?: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  progress: number;         // 0–100
  milestones: GoalMilestone[];
  linkedProjectIds: string[];
  linkedTaskIds: string[];
  deadline?: string;
  status: GoalStatus;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

// ── Q&A Memory ───────────────────────────────────────────
export interface QAMemory {
  id: string;
  question: string;
  answer: string;
  askedAt: string;
  answeredAt: string;
  confidence: QAConfidence;
  stillValid: boolean;
  context: string;           // brief description of conversation context
  expiresAt?: string;        // optional — for time-sensitive answers
  updatedAt: string;
}

// ── Knowledge Graph ──────────────────────────────────────
export type KnowledgeNodeType =
  | "project"
  | "task"
  | "goal"
  | "reminder"
  | "event"
  | "person"
  | "tool"
  | "concept"
  | "preference";

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  entityId?: string;         // reference to project/task/goal id
  createdAt: string;
}

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;          // e.g. "DEPENDS_ON", "RELATES_TO", "BLOCKS", "PART_OF"
  createdAt: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

// ── Composio Connection Tracking ─────────────────────────
export interface ComposioConnectionRecord {
  appName: string;           // e.g. "GITHUB"
  displayName: string;       // e.g. "GitHub"
  connected: boolean;
  connectedAt?: string;
  usedInProjects: string[];  // project IDs
  usedInTasks: string[];     // task IDs
  lastUsedAt?: string;
}

// ── Root Life Memory Database ─────────────────────────────
export interface LifeMemoryDB {
  projects: Project[];
  tasks: Task[];
  reminders: Reminder[];
  events: CalendarEvent[];
  goals: Goal[];
  qaMemory: QAMemory[];
  knowledgeGraph: KnowledgeGraph;
  composioConnections: ComposioConnectionRecord[];
  lastUpdated: string;
}

// ── Life Memory Transactions (for AI updates) ─────────────
export type LifeMemoryAction =
  | "CREATE_PROJECT"
  | "UPDATE_PROJECT"
  | "CREATE_TASK"
  | "UPDATE_TASK"
  | "CREATE_REMINDER"
  | "UPDATE_REMINDER"
  | "CREATE_EVENT"
  | "CREATE_GOAL"
  | "UPDATE_GOAL"
  | "ADD_QA_MEMORY"
  | "UPDATE_QA_MEMORY";

export interface LifeMemoryTransaction {
  action: LifeMemoryAction;
  entityType: "project" | "task" | "reminder" | "event" | "goal" | "qa";
  id?: string;               // existing entity ID for updates
  data: Record<string, any>; // partial entity data
}
