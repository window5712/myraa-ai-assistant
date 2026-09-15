import React, { useState } from "react";
import { Memory, MemoryCategory } from "../lib/memoryTypes";
import {
  Brain,
  X,
  Trash2,
  Plus,
  User,
  Heart,
  Target,
  Briefcase,
  Users,
  Flame,
  Sparkles,
  RefreshCw,
  Search,
  Edit2,
  Save,
  Wand2,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MemoryDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  memories: Memory[];
  onAddMemory: (category: MemoryCategory, text: string) => Promise<void>;
  onUpdateMemory?: (id: string, category: MemoryCategory, text: string) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onExtractMemories?: (sampleText?: string) => Promise<void>;
  themeColor: string;
}

export function MemoryDashboard({
  isOpen,
  onClose,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onExtractMemories,
  themeColor,
}: MemoryDashboardProps) {
  const [activeTab, setActiveTab] = useState<MemoryCategory | "all">("all");
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("identity");
  const [isAdding, setIsAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState<MemoryCategory>("identity");

  // Category Configuration
  const categoryConfig: Record<MemoryCategory, { label: string; icon: any; color: string; bg: string }> = {
    identity: {
      label: "Identity Core",
      icon: User,
      color: "text-amber-400 border-amber-500/25",
      bg: "bg-amber-500/5 hover:bg-amber-500/10",
    },
    preference: {
      label: "Preferences",
      icon: Heart,
      color: "text-pink-400 border-pink-500/25",
      bg: "bg-pink-500/5 hover:bg-pink-500/10",
    },
    goal: {
      label: "Life Goals",
      icon: Target,
      color: "text-emerald-400 border-emerald-500/25",
      bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
    },
    project: {
      label: "Active Projects",
      icon: Briefcase,
      color: "text-cyan-400 border-cyan-500/25",
      bg: "bg-cyan-500/5 hover:bg-cyan-500/10",
    },
    relationship: {
      label: "Relationships",
      icon: Users,
      color: "text-purple-400 border-purple-500/25",
      bg: "bg-purple-500/5 hover:bg-purple-500/10",
    },
    emotional: {
      label: "Milestones",
      icon: Flame,
      color: "text-red-400 border-red-500/25",
      bg: "bg-red-500/5 hover:bg-red-500/10",
    },
    behavior: {
      label: "Behaviors & Habits",
      icon: Brain,
      color: "text-indigo-400 border-indigo-500/25",
      bg: "bg-indigo-500/5 hover:bg-indigo-500/10",
    },
    tool_preference: {
      label: "Tool Preferences",
      icon: Sparkles,
      color: "text-teal-400 border-teal-500/25",
      bg: "bg-teal-500/5 hover:bg-teal-500/10",
    },
    workflow: {
      label: "Workflows & Habits",
      icon: RefreshCw,
      color: "text-blue-400 border-blue-500/25",
      bg: "bg-blue-500/5 hover:bg-blue-500/10",
    },
    communication_style: {
      label: "Communication Style",
      icon: Brain,
      color: "text-emerald-400 border-emerald-500/25",
      bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
    },
  };

  const getThemeBadgeGlow = () => {
    switch (themeColor) {
      case "violet": return "border-purple-500/30 text-purple-400 bg-purple-500/10";
      case "crimson": return "border-rose-500/30 text-rose-400 bg-rose-500/10";
      case "emerald": return "border-emerald-500/30 text-emerald-400 bg-emerald-500/10";
      case "celestial": return "border-sky-500/30 text-sky-400 bg-sky-500/10";
      case "gold": return "border-amber-500/30 text-amber-400 bg-amber-500/10";
      case "rose": return "border-pink-500/30 text-pink-400 bg-pink-500/10";
      case "charcoal":
      default:
        return "border-indigo-500/30 text-indigo-400 bg-indigo-500/10";
    }
  };

  const filteredMemories = memories.filter((m) => {
    const matchesCat = activeTab === "all" || m.category === activeTab;
    const matchesSearch =
      !searchQuery.trim() ||
      m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    setSubmitting(true);
    try {
      await onAddMemory(newCategory, newText.trim());
      setNewText("");
      setIsAdding(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditText(m.text);
    setEditCategory(m.category);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim() || !onUpdateMemory) return;
    try {
      await onUpdateMemory(id, editCategory, editText.trim());
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutoExtract = async () => {
    if (!onExtractMemories) return;
    setIsExtracting(true);
    try {
      await onExtractMemories();
    } catch (err) {
      console.error("Auto extraction trigger failed:", err);
    } finally {
      setIsExtracting(false);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return "Durable Record";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />

          {/* Slide-over Container */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute inset-y-0 right-0 w-full max-w-lg bg-[#020206]/95 border-l border-white/15 backdrop-blur-2xl z-50 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] font-sans"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${getThemeBadgeGlow()}`}>
                  <Brain size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="font-display font-medium text-lg tracking-tight text-white flex items-center gap-2">
                    Alya Memory Core
                    <Sparkles size={14} className="text-cyan-400" />
                  </h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-0.5">
                    Persistent recollection records ({memories.length})
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick stats & action row */}
            <div className="px-6 py-3.5 bg-white/5 border-b border-white/5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-mono">
                💡 Saved to memories.json (persists across restarts)
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {onExtractMemories && (
                  <button
                    onClick={handleAutoExtract}
                    disabled={isExtracting}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-xs font-mono tracking-wider text-purple-300 transition cursor-pointer disabled:opacity-50"
                    title="Auto-detect durable facts from speech turns"
                  >
                    <Wand2 size={12} className={isExtracting ? "animate-spin" : ""} />
                    <span>{isExtracting ? "EXTRACTING..." : "AUTO-EXTRACT"}</span>
                  </button>
                )}

                {!isAdding && (
                  <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-mono tracking-wider text-cyan-300 transition cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>SEED</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search Filter Bar */}
            <div className="px-6 py-2.5 bg-black/40 border-b border-white/5">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter memories by keyword..."
                  className="w-full py-1.5 pl-8 pr-3 rounded-xl border border-white/10 bg-white/5 text-slate-200 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                />
                <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
              </div>
            </div>

            {/* Manual entry card drawer inside dashboard */}
            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-white/15 bg-[#080812]"
                >
                  <form onSubmit={handleManualAdd} className="p-5 space-y-4">
                    <div>
                      <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-2">
                        Memory Category
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(Object.keys(categoryConfig) as MemoryCategory[]).map((cat) => {
                          const Icon = categoryConfig[cat].icon;
                          const active = newCategory === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setNewCategory(cat)}
                              className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs tracking-wide transition cursor-pointer ${
                                active
                                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                  : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10"
                              }`}
                            >
                              <Icon size={12} />
                              <span className="truncate">{categoryConfig[cat].label.split(" ")[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-2">
                        Recollection Statement (3rd Person declarative)
                      </label>
                      <textarea
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="e.g. The user's startup is Alya AI Agent."
                        required
                        className="w-full h-18 text-xs p-3 rounded-lg border border-white/10 bg-black/40 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 resize-none font-sans"
                      />
                    </div>

                    <div className="flex gap-2.5 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsAdding(false)}
                        className="px-3.5 py-1.5 rounded-lg border border-white/5 text-xs font-mono tracking-wide text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase font-mono tracking-widest transition disabled:opacity-50 cursor-pointer"
                      >
                        {submitting ? "Saving..." : "Commit Memory"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* TAB SELECTOR SCROLLER */}
            <div className="px-6 py-3 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-white/10 shrink-0">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-full border text-[11px] tracking-wider uppercase transition cursor-pointer shrink-0 ${
                  activeTab === "all"
                    ? "border-white bg-white text-slate-950 font-bold"
                    : "border-white/5 bg-white/5 text-slate-400 hover:border-white/15"
                }`}
              >
                All Memories
              </button>
              {(Object.keys(categoryConfig) as MemoryCategory[]).map((cat) => {
                const config = categoryConfig[cat];
                const active = activeTab === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    className={`px-3 py-1.5 rounded-full border text-[11px] tracking-wider uppercase transition shrink-0 cursor-pointer ${
                      active
                        ? "border-white bg-white text-slate-950 font-bold"
                        : "border-white/5 bg-white/5 text-slate-400 hover:border-white/15"
                    }`}
                  >
                    {config.label.split(" ")[0]}
                  </button>
                );
              })}
            </div>

            {/* RECOLLECTION ITEMS CARDS CONTAINER */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3.5 custom-scroll">
              <AnimatePresence initial={false}>
                {filteredMemories.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500"
                  >
                    <div className="p-4 rounded-full border border-dashed border-white/10 bg-white/[0.02] mb-4">
                      <Brain size={32} className="opacity-40" />
                    </div>
                    <h4 className="text-sm font-semibold tracking-wide text-slate-300">No memories recorded</h4>
                    <p className="text-xs max-w-xs mt-1.5 leading-relaxed font-mono">
                      {searchQuery
                        ? `No memories matching "${searchQuery}".`
                        : activeTab === "all"
                        ? "Start talking aloud with Alya! Her background consolidator extracts transcript facts into durable memory."
                        : `No persistent recollections saved in Category "${categoryConfig[activeTab as MemoryCategory]?.label}".`}
                    </p>
                  </motion.div>
                ) : (
                  filteredMemories.map((m) => {
                    const cfg = categoryConfig[m.category];
                    const Icon = cfg.icon;
                    const isEditingThis = editingId === m.id;

                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`p-4 rounded-xl border border-white/5 backdrop-blur-md bg-white/[0.02] ${cfg.bg} transition-colors group relative`}
                      >
                        {isEditingThis ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                                className="px-2 py-1 rounded bg-black/60 border border-white/10 text-xs text-cyan-300 font-mono focus:outline-none"
                              >
                                {(Object.keys(categoryConfig) as MemoryCategory[]).map((cat) => (
                                  <option key={cat} value={cat}>
                                    {categoryConfig[cat].label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full h-16 p-2 rounded bg-black/60 border border-white/10 text-xs text-white resize-none font-sans focus:outline-none focus:border-cyan-500/50"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={cancelEdit}
                                className="px-2.5 py-1 rounded border border-white/10 text-[10px] font-mono text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEdit(m.id)}
                                className="px-3 py-1 rounded bg-cyan-500 text-slate-950 font-bold text-[10px] font-mono uppercase flex items-center gap-1"
                              >
                                <Check size={10} /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-3.5 overflow-hidden">
                              <div className={`p-2 rounded-lg border mt-0.5 shrink-0 bg-black/40 ${cfg.color}`}>
                                <Icon size={14} />
                              </div>
                              <div className="overflow-hidden">
                                <span className={`text-[9px] font-mono uppercase tracking-wider block ${cfg.color}`}>
                                  {cfg.label}
                                </span>
                                <p className="text-xs text-slate-200 mt-1 font-sans leading-relaxed break-words font-medium">
                                  {m.text}
                                </p>
                                <span className="text-[9px] font-mono text-slate-500 mt-2 block">
                                  Recalled: {formatDate(m.createdAt)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition duration-150 absolute top-4 right-4 sm:relative sm:top-0 sm:right-0 shrink-0">
                              {onUpdateMemory && (
                                <button
                                  onClick={() => startEdit(m)}
                                  className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
                                  title="Edit memory"
                                >
                                  <Edit2 size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => onDeleteMemory(m.id)}
                                className="p-1.5 rounded-lg border border-red-500/25 bg-red-950/15 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                                title="Forget this memory"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>

            {/* Technical visual core footprint footer */}
            <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between text-[9px] font-mono text-slate-500 tracking-wider">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.7)] animate-pulse" />
                <span>MEM-SYNC LIVE SEED</span>
              </span>
              <span>DURABLE LOCAL JSON CORE</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
