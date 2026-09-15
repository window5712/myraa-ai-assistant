/**
 * LifeMemoryDashboard.tsx
 * ──────────────────────────────────────────────────────
 * Alya Life OS — Full Personal Memory & Life Management UI
 * 7-tab dashboard: Projects | Tasks | Reminders | Calendar
 *                  Goals | Q&A Memory | Knowledge Graph
 * ──────────────────────────────────────────────────────
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Briefcase,
  CheckSquare,
  Bell,
  Calendar,
  Target,
  MessageCircle,
  Share2,
  Plus,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  PauseCircle,
  XCircle,
  RotateCcw,
  Loader2,
  Trash2,
  Edit2,
  Save,
  Link2,
  Zap,
  Flag,
  Tag,
  ArrowRight,
  Play,
  Pause,
  RefreshCw,
  TrendingUp,
  Brain,
  Sparkles,
} from "lucide-react";
import {
  Project,
  Task,
  Reminder,
  CalendarEvent,
  Goal,
  QAMemory,
  LifeMemoryDB,
  Priority,
  TaskStatus,
  ProjectStatus,
  ReminderStatus,
} from "../lib/memoryTypes";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface LifeMemoryDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  db: LifeMemoryDB;
  themeColor: string;
  onRefresh: () => void;
  onComposioConnect?: (appName: string) => void;
}

type TabId =
  | "projects"
  | "tasks"
  | "reminders"
  | "calendar"
  | "goals"
  | "qa"
  | "graph";

// ─────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-slate-500",
};

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  idea: "text-slate-400 border-slate-500/20 bg-slate-500/10",
  planned: "text-blue-400 border-blue-500/20 bg-blue-500/10",
  queued: "text-indigo-400 border-indigo-500/20 bg-indigo-500/10",
  in_progress: "text-cyan-400 border-cyan-500/20 bg-cyan-500/10",
  waiting_user: "text-amber-400 border-amber-500/20 bg-amber-500/10",
  waiting_external: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10",
  blocked: "text-red-400 border-red-500/20 bg-red-500/10",
  completed: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  failed: "text-rose-400 border-rose-500/20 bg-rose-500/10",
  cancelled: "text-slate-500 border-slate-600/20 bg-slate-700/10",
  archived: "text-slate-600 border-slate-700/20 bg-slate-800/10",
  reopened: "text-purple-400 border-purple-500/20 bg-purple-500/10",
};

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  idea: "text-slate-400",
  active: "text-cyan-400",
  paused: "text-amber-400",
  blocked: "text-red-400",
  completed: "text-emerald-400",
  archived: "text-slate-500",
};

const PROJECT_STATUS_ICON: Record<ProjectStatus, React.ReactNode> = {
  idea: <Circle size={12} />,
  active: <Play size={12} />,
  paused: <Pause size={12} />,
  blocked: <AlertTriangle size={12} />,
  completed: <CheckCircle2 size={12} />,
  archived: <PauseCircle size={12} />,
};

const REMINDER_STATUS_COLOR: Record<ReminderStatus, string> = {
  scheduled: "text-cyan-400 border-cyan-500/20 bg-cyan-500/10",
  triggered: "text-amber-400 border-amber-500/20 bg-amber-500/10",
  completed: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  dismissed: "text-slate-400 border-slate-500/20 bg-slate-500/10",
  snoozed: "text-purple-400 border-purple-500/20 bg-purple-500/10",
  cancelled: "text-rose-400 border-rose-500/20 bg-rose-500/10",
  missed: "text-red-400 border-red-500/20 bg-red-500/10",
};

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────
async function apiCall(
  method: string,
  path: string,
  body?: any
): Promise<any> {
  const resp = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return resp.json();
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

// ── Projects Tab ──────────────────────────────────────────
function ProjectsTab({
  projects,
  onRefresh,
}: {
  projects: Project[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "all">("all");

  const filtered = projects.filter(
    (p) => filterStatus === "all" || p.status === filterStatus
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await apiCall("POST", "/api/life/projects", { name, purpose, priority });
    setName("");
    setPurpose("");
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const handleStatusChange = async (id: string, status: ProjectStatus) => {
    await apiCall("PUT", `/api/life/projects/${id}`, { status });
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    await apiCall("DELETE", `/api/life/projects/${id}`);
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      {/* Filter + Add */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "paused", "blocked", "completed", "archived"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider transition cursor-pointer ${
                  filterStatus === s
                    ? "border-white bg-white text-slate-950 font-bold"
                    : "border-white/10 text-slate-400 hover:border-white/25"
                }`}
              >
                {s}
              </button>
            )
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-xs font-mono hover:bg-cyan-500/20 transition cursor-pointer"
        >
          <Plus size={12} /> ADD PROJECT
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Purpose / goal…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <div className="flex gap-2">
              {(["low", "medium", "high", "critical"] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                    priority === p
                      ? PRIORITY_COLORS[p] + " font-bold"
                      : "border-white/10 text-slate-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer"
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Project cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
          <Briefcase size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">No projects yet</p>
        </div>
      ) : (
        filtered.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={PROJECT_STATUS_COLOR[p.status]}>
                    {PROJECT_STATUS_ICON[p.status]}
                  </span>
                  <h4 className="font-semibold text-sm text-white truncate">
                    {p.name}
                  </h4>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${PRIORITY_COLORS[p.priority]}`}
                  >
                    {p.priority}
                  </span>
                </div>
                {p.purpose && (
                  <p className="text-xs text-slate-400 mb-2 leading-relaxed">
                    {p.purpose}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                  {p.tech.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                {p.nextAction && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                    <ArrowRight size={10} />
                    <span className="truncate">{p.nextAction}</span>
                  </div>
                )}
                {p.blockers.length > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-red-400 font-mono">
                    <AlertTriangle size={10} />
                    <span className="truncate">
                      {p.blockers[p.blockers.length - 1]}
                    </span>
                  </div>
                )}
                {p.composioAppsNeeded.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Zap size={10} className="text-amber-400" />
                    <span className="text-[10px] font-mono text-amber-400">
                      Needs: {p.composioAppsNeeded.join(", ")}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-slate-500">
                  <span>
                    ✅ {p.completedWork.length} done · ⏳ {p.pendingWork.length} pending
                  </span>
                  {p.deadline && (
                    <span className="text-amber-400">
                      Due {formatDate(p.deadline)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                {(["active", "paused", "completed", "archived"] as ProjectStatus[])
                  .filter((s) => s !== p.status)
                  .slice(0, 2)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(p.id, s)}
                      title={`Set ${s}`}
                      className={`px-2 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${PROJECT_STATUS_COLOR[s]} border-white/10 hover:border-white/30`}
                    >
                      {s}
                    </button>
                  ))}
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}

// ── Tasks Tab ─────────────────────────────────────────────
function TasksTab({
  tasks,
  projects,
  onRefresh,
  onComposioConnect,
}: {
  tasks: Task[];
  projects: Project[];
  onRefresh: () => void;
  onComposioConnect?: (appName: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");

  const activeStatuses: (TaskStatus | "all")[] = [
    "all", "in_progress", "planned", "queued", "blocked", "waiting_user", "completed",
  ];

  const filtered = tasks.filter(
    (t) => filterStatus === "all" || t.status === filterStatus
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await apiCall("POST", "/api/life/tasks", {
      title,
      description,
      priority,
      projectId: projectId || undefined,
      deadline: deadline || undefined,
    });
    setTitle("");
    setDescription("");
    setProjectId("");
    setDeadline("");
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    await apiCall("PUT", `/api/life/tasks/${id}`, { status });
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    await apiCall("DELETE", `/api/life/tasks/${id}`);
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {activeStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider transition cursor-pointer ${
                filterStatus === s
                  ? "border-white bg-white text-slate-950 font-bold"
                  : "border-white/10 text-slate-400 hover:border-white/25"
              }`}
            >
              {s === "all" ? "all" : s.replace("_", " ")}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-mono hover:bg-purple-500/20 transition cursor-pointer"
        >
          <Plus size={12} /> ADD TASK
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)…"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500/50 resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-white/10 bg-black/40 text-xs text-slate-300 focus:outline-none"
              >
                <option value="">No project</option>
                {projects.filter((p) => p.status === "active").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-white/10 bg-black/40 text-xs text-slate-300 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              {(["low", "medium", "high", "critical"] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                    priority === p
                      ? PRIORITY_COLORS[p] + " font-bold"
                      : "border-white/10 text-slate-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs rounded-lg transition cursor-pointer"
              >
                {saving ? "Saving…" : "Create Task"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
          <CheckSquare size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">No tasks found</p>
        </div>
      ) : (
        filtered.map((t) => {
          const proj = projects.find((p) => p.id === t.projectId);
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                        TASK_STATUS_COLOR[t.status]
                      }`}
                    >
                      {t.status.replace("_", " ")}
                    </span>
                    <h4 className="font-medium text-sm text-white">{t.title}</h4>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`}
                      title={t.priority}
                    />
                  </div>
                  {t.description && (
                    <p className="text-xs text-slate-400 mb-2 leading-relaxed">
                      {t.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 flex-wrap">
                    {proj && (
                      <span className="text-cyan-400 flex items-center gap-1">
                        <Briefcase size={9} />
                        {proj.name}
                      </span>
                    )}
                    {t.deadline && (
                      <span
                        className={
                          new Date(t.deadline) < new Date()
                            ? "text-red-400"
                            : "text-amber-400"
                        }
                      >
                        <Clock size={9} className="inline mr-0.5" />
                        {formatDateTime(t.deadline)}
                      </span>
                    )}
                    {t.progress > 0 && (
                      <span className="text-indigo-400">
                        {t.progress}% done
                      </span>
                    )}
                  </div>

                  {/* Composio app connection warning */}
                  {t.requiredComposioApp && !t.composioAppConnected && (
                    <div className="mt-2 flex items-center gap-2 p-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <Zap size={12} className="text-amber-400 shrink-0" />
                      <span className="text-[11px] text-amber-300 font-mono flex-1">
                        Needs {t.requiredComposioApp} — not connected
                      </span>
                      {onComposioConnect && (
                        <button
                          onClick={() =>
                            onComposioConnect(t.requiredComposioApp!)
                          }
                          className="px-2 py-0.5 rounded text-[10px] bg-amber-500 text-black font-bold hover:bg-amber-400 transition cursor-pointer shrink-0"
                        >
                          CONNECT
                        </button>
                      )}
                    </div>
                  )}
                  {t.requiredComposioApp && t.composioAppConnected && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                      <Zap size={9} />
                      {t.requiredComposioApp} connected ✓
                    </div>
                  )}

                  {t.nextAction && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                      <ArrowRight size={10} />
                      {t.nextAction}
                    </div>
                  )}
                  {t.errors.length > 0 && (
                    <div className="mt-1 text-[10px] text-red-400 font-mono flex items-center gap-1">
                      <AlertTriangle size={9} />
                      {t.errors[t.errors.length - 1]}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 flex-col">
                  {t.status !== "completed" && (
                    <button
                      onClick={() => handleStatusChange(t.id, "completed")}
                      className="p-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                      title="Mark complete"
                    >
                      <CheckCircle2 size={12} />
                    </button>
                  )}
                  {t.status !== "in_progress" && t.status !== "completed" && (
                    <button
                      onClick={() => handleStatusChange(t.id, "in_progress")}
                      className="p-1.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer"
                      title="Start"
                    >
                      <Play size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}

// ── Reminders Tab ─────────────────────────────────────────
function RemindersTab({
  reminders,
  onRefresh,
}: {
  reminders: Reminder[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [saving, setSaving] = useState(false);

  const sorted = [...reminders].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  );
  const active = sorted.filter((r) => r.status === "scheduled" || r.status === "triggered");
  const past = sorted.filter((r) => r.status !== "scheduled" && r.status !== "triggered");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !dueAt) return;
    setSaving(true);
    await apiCall("POST", "/api/life/reminders", {
      text,
      dueAt: new Date(dueAt).toISOString(),
      recurrence,
    });
    setText("");
    setDueAt("");
    setRecurrence("none");
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const handleAction = async (id: string, status: ReminderStatus) => {
    await apiCall("PUT", `/api/life/reminders/${id}`, { status });
    onRefresh();
  };

  const handleSnooze = async (id: string) => {
    const snoozedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await apiCall("PUT", `/api/life/reminders/${id}`, {
      status: "snoozed",
      snoozedUntil,
    });
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-slate-400">
          {active.length} active reminder{active.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-mono hover:bg-amber-500/20 transition cursor-pointer"
        >
          <Plus size={12} /> SET REMINDER
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What to remind you about…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-xs text-slate-300 focus:outline-none"
            />
            <div className="flex gap-2">
              {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecurrence(r)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                    recurrence === r
                      ? "border-amber-500/50 text-amber-300 bg-amber-500/10"
                      : "border-white/10 text-slate-500"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition cursor-pointer"
              >
                {saving ? "Saving…" : "Set Reminder"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {active.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-center">
          <Bell size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">No active reminders</p>
        </div>
      )}
      {active.map((r) => {
        const isOverdue = r.status === "scheduled" && new Date(r.dueAt) < new Date();
        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border ${
              isOverdue
                ? "border-red-500/30 bg-red-500/5"
                : r.status === "triggered"
                ? "border-amber-500/30 bg-amber-500/5 animate-pulse"
                : "border-white/5 bg-white/[0.02]"
            } group transition`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Bell
                    size={13}
                    className={
                      isOverdue
                        ? "text-red-400"
                        : r.status === "triggered"
                        ? "text-amber-400"
                        : "text-slate-400"
                    }
                  />
                  <span className="text-sm text-white font-medium">{r.text}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                  <span
                    className={isOverdue ? "text-red-400 font-bold" : "text-slate-400"}
                  >
                    <Clock size={9} className="inline mr-0.5" />
                    {formatDateTime(r.dueAt)}
                  </span>
                  {r.recurrence !== "none" && (
                    <span className="text-purple-400">
                      <RotateCcw size={9} className="inline mr-0.5" />
                      {r.recurrence}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded border ${REMINDER_STATUS_COLOR[r.status]}`}>
                    {r.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                <button
                  onClick={() => handleSnooze(r.id)}
                  className="p-1.5 rounded border border-purple-500/20 text-purple-400 hover:bg-purple-500/10 transition cursor-pointer"
                  title="Snooze 30min"
                >
                  <PauseCircle size={11} />
                </button>
                <button
                  onClick={() => handleAction(r.id, "completed")}
                  className="p-1.5 rounded border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                  title="Mark done"
                >
                  <CheckCircle2 size={11} />
                </button>
                <button
                  onClick={() => handleAction(r.id, "cancelled")}
                  className="p-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  title="Cancel"
                >
                  <XCircle size={11} />
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}

      {past.length > 0 && (
        <details className="mt-4">
          <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-300 transition">
            PAST REMINDERS ({past.length})
          </summary>
          <div className="mt-2 space-y-2 opacity-50">
            {past.slice(0, 10).map((r) => (
              <div
                key={r.id}
                className="p-3 rounded-lg border border-white/5 flex items-center gap-2"
              >
                <span
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${REMINDER_STATUS_COLOR[r.status]}`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-slate-400 flex-1 truncate">
                  {r.text}
                </span>
                <span className="text-[10px] font-mono text-slate-600">
                  {formatDate(r.dueAt)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Calendar Tab ──────────────────────────────────────────
function CalendarTab({
  events,
  onRefresh,
}: {
  events: CalendarEvent[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const upcoming = events
    .filter((e) => e.startAt >= todayStr)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = events
    .filter((e) => e.startAt < todayStr)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startAt) return;
    setSaving(true);
    await apiCall("POST", "/api/life/events", {
      title,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : undefined,
      description,
    });
    setTitle("");
    setStartAt("");
    setEndAt("");
    setDescription("");
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await apiCall("DELETE", `/api/life/events/${id}`);
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-slate-400">
          {upcoming.length} upcoming event{upcoming.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-mono hover:bg-indigo-500/20 transition cursor-pointer"
        >
          <Plus size={12} /> ADD EVENT
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">START</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-white/10 bg-black/40 text-xs text-slate-300 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">END (opt)</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-white/10 bg-black/40 text-xs text-slate-300 focus:outline-none"
                />
              </div>
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes (optional)…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-lg transition cursor-pointer"
              >
                {saving ? "Saving…" : "Add Event"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-center">
          <Calendar size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">No upcoming events</p>
        </div>
      ) : (
        upcoming.map((evt) => (
          <motion.div
            key={evt.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-indigo-500/15 bg-indigo-500/5 hover:bg-indigo-500/10 transition group"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={12} className="text-indigo-400" />
                  <h4 className="text-sm font-medium text-white">{evt.title}</h4>
                </div>
                <div className="text-[10px] font-mono text-slate-400 space-x-2">
                  <span>{formatDateTime(evt.startAt)}</span>
                  {evt.endAt && <span>→ {formatDateTime(evt.endAt)}</span>}
                </div>
                {evt.description && (
                  <p className="text-xs text-slate-500 mt-1">{evt.description}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(evt.id)}
                className="p-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition cursor-pointer"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </motion.div>
        ))
      )}

      {past.length > 0 && (
        <details className="mt-4">
          <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-300">
            PAST EVENTS ({past.length})
          </summary>
          <div className="mt-2 space-y-1 opacity-40">
            {past.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1 text-xs text-slate-500 font-mono">
                <span>{formatDate(e.startAt)}</span>
                <span className="text-slate-400">{e.title}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────
function GoalsTab({
  goals,
  onRefresh,
}: {
  goals: Goal[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const active = goals.filter((g) => g.status === "active" || g.status === "paused");
  const done = goals.filter((g) => g.status === "completed" || g.status === "archived");

  const nowMs = Date.now();
  const inactiveGoals = active.filter(
    (g) => new Date(g.lastActivityAt).getTime() < nowMs - 14 * 24 * 60 * 60 * 1000
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await apiCall("POST", "/api/life/goals", {
      title,
      description,
      deadline: deadline || undefined,
    });
    setTitle("");
    setDescription("");
    setDeadline("");
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const handleProgressUpdate = async (id: string, progress: number) => {
    await apiCall("PUT", `/api/life/goals/${id}`, { progress });
    onRefresh();
  };

  const handleStatusChange = async (id: string, status: "active" | "paused" | "completed" | "archived") => {
    await apiCall("PUT", `/api/life/goals/${id}`, { status });
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      {inactiveGoals.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300 font-mono">
            {inactiveGoals.length} goal(s) inactive for 2+ weeks:{" "}
            {inactiveGoals.map((g) => `"${g.title}"`).join(", ")}. Want to continue?
          </p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-slate-400">
          {active.length} active goal{active.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono hover:bg-emerald-500/20 transition cursor-pointer"
        >
          <Plus size={12} /> ADD GOAL
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal title…"
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description…"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-xs placeholder-slate-500 focus:outline-none resize-none"
            />
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-xs text-slate-300 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition cursor-pointer"
              >
                {saving ? "Saving…" : "Add Goal"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {active.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-center">
          <Target size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">No active goals</p>
        </div>
      ) : (
        active.map((g) => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Target size={13} className="text-emerald-400" />
                  <h4 className="text-sm font-medium text-white">{g.title}</h4>
                  {g.status === "paused" && (
                    <span className="text-[9px] font-mono text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      paused
                    </span>
                  )}
                </div>
                {g.description && (
                  <p className="text-xs text-slate-400 mb-3">{g.description}</p>
                )}
                {/* Progress bar */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500"
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {g.progress}%
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => handleProgressUpdate(g.id, pct)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition cursor-pointer ${
                        g.progress === pct
                          ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                          : "border-white/10 text-slate-500 hover:border-white/25"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                {g.deadline && (
                  <div className="mt-2 text-[10px] font-mono text-amber-400">
                    <Clock size={9} className="inline mr-0.5" />
                    Due {formatDate(g.deadline)}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                {g.status !== "completed" && (
                  <button
                    onClick={() => handleStatusChange(g.id, "completed")}
                    className="p-1.5 rounded border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                    title="Complete"
                  >
                    <CheckCircle2 size={12} />
                  </button>
                )}
                <button
                  onClick={() =>
                    handleStatusChange(g.id, g.status === "paused" ? "active" : "paused")
                  }
                  className="p-1.5 rounded border border-amber-500/20 text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                  title={g.status === "paused" ? "Resume" : "Pause"}
                >
                  {g.status === "paused" ? <Play size={12} /> : <Pause size={12} />}
                </button>
              </div>
            </div>
          </motion.div>
        ))
      )}

      {done.length > 0 && (
        <details>
          <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-300">
            COMPLETED/ARCHIVED ({done.length})
          </summary>
          <div className="mt-2 space-y-1 opacity-40">
            {done.slice(0, 5).map((g) => (
              <div key={g.id} className="flex items-center gap-2 py-1 text-xs text-slate-500 font-mono">
                <CheckCircle2 size={10} className="text-emerald-500" />
                <span>{g.title}</span>
                <span className="text-slate-600">{g.progress}%</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Q&A Memory Tab ────────────────────────────────────────
function QAMemoryTab({
  qaMemory,
  onRefresh,
}: {
  qaMemory: QAMemory[];
  onRefresh: () => void;
}) {
  const valid = qaMemory.filter((qa) => qa.stillValid);
  const invalid = qaMemory.filter((qa) => !qa.stillValid);

  const handleInvalidate = async (id: string) => {
    await apiCall("PUT", `/api/life/qa/${id}`, { stillValid: false });
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await apiCall("DELETE", `/api/life/qa/${id}`);
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      <div className="p-3 rounded-xl border border-purple-500/15 bg-purple-500/5 text-xs font-mono text-purple-300">
        <Brain size={12} className="inline mr-1.5" />
        Alya remembers these Q&A pairs and uses them in future conversations. She won't re-ask questions she already knows the answer to.
      </div>

      {valid.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-center">
          <MessageCircle size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">No Q&A memories yet</p>
          <p className="text-xs mt-1">Alya automatically stores meaningful question-answer pairs from your conversations.</p>
        </div>
      ) : (
        valid.map((qa) => (
          <motion.div
            key={qa.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageCircle size={12} className="text-purple-400 shrink-0" />
                  <p className="text-xs text-slate-300 font-medium italic">
                    "{qa.question}"
                  </p>
                </div>
                <div className="ml-4 flex items-start gap-1.5">
                  <ArrowRight size={11} className="text-cyan-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-white leading-relaxed">{qa.answer}</p>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[9px] font-mono text-slate-500">
                  <span>Asked: {formatDate(qa.askedAt)}</span>
                  <span
                    className={
                      qa.confidence === "high"
                        ? "text-emerald-400"
                        : qa.confidence === "medium"
                        ? "text-amber-400"
                        : "text-red-400"
                    }
                  >
                    {qa.confidence} confidence
                  </span>
                  {qa.context && (
                    <span className="text-slate-600 truncate">{qa.context}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => handleInvalidate(qa.id)}
                  className="p-1.5 rounded border border-amber-500/20 text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                  title="Mark as outdated"
                >
                  <XCircle size={11} />
                </button>
                <button
                  onClick={() => handleDelete(qa.id)}
                  className="p-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </motion.div>
        ))
      )}

      {invalid.length > 0 && (
        <details>
          <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-300">
            OUTDATED Q&A ({invalid.length})
          </summary>
          <div className="mt-2 space-y-1 opacity-40">
            {invalid.slice(0, 5).map((qa) => (
              <div key={qa.id} className="py-1 text-xs text-slate-600 font-mono truncate">
                Q: {qa.question}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Knowledge Graph Tab ───────────────────────────────────
function KnowledgeGraphTab({
  db,
}: {
  db: LifeMemoryDB;
}) {
  const nodeTypeColors: Record<string, string> = {
    project: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
    task: "text-purple-400 border-purple-500/20 bg-purple-500/5",
    goal: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    reminder: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    event: "text-indigo-400 border-indigo-500/20 bg-indigo-500/5",
    person: "text-pink-400 border-pink-500/20 bg-pink-500/5",
    tool: "text-teal-400 border-teal-500/20 bg-teal-500/5",
    concept: "text-slate-400 border-slate-500/20 bg-slate-500/5",
    preference: "text-rose-400 border-rose-500/20 bg-rose-500/5",
  };

  const { nodes, edges } = db.knowledgeGraph;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
      <div className="p-3 rounded-xl border border-indigo-500/15 bg-indigo-500/5 text-xs font-mono text-indigo-300">
        <Share2 size={12} className="inline mr-1.5" />
        {nodes.length} entities · {edges.length} relationships — Alya uses this to understand how your work connects.
      </div>

      {/* Composio connections */}
      {db.composioConnections.length > 0 && (
        <div>
          <h5 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
            Connected Apps
          </h5>
          <div className="flex flex-wrap gap-2">
            {db.composioConnections.map((c) => (
              <div
                key={c.appName}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                  c.connected
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                <Zap size={10} />
                {c.displayName || c.appName}
                {c.connected ? " ✓" : " ✗"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node list */}
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-center">
          <Share2 size={32} className="opacity-30 mb-3" />
          <p className="text-sm font-mono">Knowledge graph is empty</p>
          <p className="text-xs mt-1">Nodes are auto-created as you add projects, tasks, and goals.</p>
        </div>
      ) : (
        <div>
          <h5 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
            Entity Nodes ({nodes.length})
          </h5>
          <div className="flex flex-wrap gap-2">
            {nodes.map((n) => (
              <span
                key={n.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-mono ${
                  nodeTypeColors[n.type] || nodeTypeColors.concept
                }`}
              >
                <span className="opacity-60">{n.type}</span>
                <span>{n.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {edges.length > 0 && (
        <div>
          <h5 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
            Relationships ({edges.length})
          </h5>
          <div className="space-y-1.5">
            {edges.slice(0, 20).map((e) => {
              const from = nodes.find((n) => n.id === e.fromNodeId);
              const to = nodes.find((n) => n.id === e.toNodeId);
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-[10px] font-mono text-slate-400 p-2 rounded-lg border border-white/5 bg-white/[0.01]"
                >
                  <span className="text-slate-300">{from?.label || "?"}</span>
                  <ArrowRight size={9} />
                  <span className="text-indigo-400">{e.relation}</span>
                  <ArrowRight size={9} />
                  <span className="text-slate-300">{to?.label || "?"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────
export function LifeMemoryDashboard({
  isOpen,
  onClose,
  db,
  themeColor,
  onRefresh,
  onComposioConnect,
}: LifeMemoryDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("projects");

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: "projects",
      label: "Projects",
      icon: <Briefcase size={13} />,
      count: db.projects.filter((p) => p.status === "active").length,
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: <CheckSquare size={13} />,
      count: db.tasks.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "archived"
      ).length,
    },
    {
      id: "reminders",
      label: "Reminders",
      icon: <Bell size={13} />,
      count: db.reminders.filter((r) => r.status === "scheduled").length,
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: <Calendar size={13} />,
      count: db.events.filter(
        (e) => e.startAt >= new Date().toISOString().split("T")[0]
      ).length,
    },
    {
      id: "goals",
      label: "Goals",
      icon: <Target size={13} />,
      count: db.goals.filter((g) => g.status === "active").length,
    },
    {
      id: "qa",
      label: "Q&A",
      icon: <MessageCircle size={13} />,
      count: db.qaMemory.filter((qa) => qa.stillValid).length,
    },
    {
      id: "graph",
      label: "Graph",
      icon: <Share2 size={13} />,
      count: db.knowledgeGraph.nodes.length,
    },
  ];

  // Stats summary for header
  const totalPendingTasks = db.tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "archived"
  ).length;
  const dueReminders = db.reminders.filter(
    (r) => r.status === "scheduled" && new Date(r.dueAt) <= new Date()
  ).length;
  const disconnectedTaskApps = db.tasks.filter(
    (t) => t.requiredComposioApp && !t.composioAppConnected
  ).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="absolute inset-y-0 right-0 w-full max-w-xl bg-[#020206]/97 border-l border-white/10 backdrop-blur-2xl z-50 flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.9)] font-sans"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
                  <Sparkles size={20} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-base tracking-tight text-white flex items-center gap-2">
                    Life OS
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  </h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    Personal Memory & Work Intelligence
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onRefresh}
                  className="p-2 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Quick stats strip */}
            <div className="px-5 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center gap-4 text-[10px] font-mono shrink-0">
              <span className="flex items-center gap-1 text-purple-300">
                <CheckSquare size={10} />
                {totalPendingTasks} pending
              </span>
              <span
                className={`flex items-center gap-1 ${
                  dueReminders > 0 ? "text-amber-400 font-bold" : "text-slate-400"
                }`}
              >
                <Bell size={10} />
                {dueReminders} due now
              </span>
              <span
                className={`flex items-center gap-1 ${
                  disconnectedTaskApps > 0 ? "text-red-400" : "text-slate-500"
                }`}
              >
                <Zap size={10} />
                {disconnectedTaskApps} needs connect
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <TrendingUp size={10} />
                {db.goals.filter((g) => g.status === "active").length} goals
              </span>
            </div>

            {/* Tabs */}
            <div className="border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex px-4 min-w-max">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-[11px] font-mono tracking-wider uppercase border-b-2 transition cursor-pointer whitespace-nowrap ${
                      activeTab === tab.id
                        ? "border-indigo-400 text-white"
                        : "border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] ${
                          activeTab === tab.id
                            ? "bg-indigo-500/30 text-indigo-200"
                            : "bg-white/10 text-slate-400"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === "projects" && (
                <ProjectsTab projects={db.projects} onRefresh={onRefresh} />
              )}
              {activeTab === "tasks" && (
                <TasksTab
                  tasks={db.tasks}
                  projects={db.projects}
                  onRefresh={onRefresh}
                  onComposioConnect={onComposioConnect}
                />
              )}
              {activeTab === "reminders" && (
                <RemindersTab reminders={db.reminders} onRefresh={onRefresh} />
              )}
              {activeTab === "calendar" && (
                <CalendarTab events={db.events} onRefresh={onRefresh} />
              )}
              {activeTab === "goals" && (
                <GoalsTab goals={db.goals} onRefresh={onRefresh} />
              )}
              {activeTab === "qa" && (
                <QAMemoryTab qaMemory={db.qaMemory} onRefresh={onRefresh} />
              )}
              {activeTab === "graph" && <KnowledgeGraphTab db={db} />}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10 bg-black/40 flex items-center justify-between text-[9px] font-mono text-slate-500 tracking-wider shrink-0">
              <span className="flex items-center gap-1.5 text-indigo-400">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_5px_rgba(99,102,241,0.7)] animate-pulse" />
                LIFE-MEMORY LIVE
              </span>
              <span>life_memory.json · persistent</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
