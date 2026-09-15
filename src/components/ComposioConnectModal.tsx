import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  ShieldCheck,
  Link2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  UserCheck,
  AlertTriangle,
} from "lucide-react";

export interface AppDefinition {
  slug: string;
  displayName: string;
  category: string;
  emoji: string;
  description: string;
  capabilities: string[];
  color: string;
  textColor: string;
}

export const APP_CATALOGUE: AppDefinition[] = [
  {
    slug: "gmail",
    displayName: "Gmail",
    category: "Email",
    emoji: "📧",
    description: "Read, send & organize email messages",
    capabilities: ["Read inbox messages", "Send emails", "Search threads & contacts", "Create drafts"],
    color: "from-red-500/20 to-red-600/10 border-red-500/25",
    textColor: "text-red-400",
  },
  {
    slug: "github",
    displayName: "GitHub",
    category: "Dev",
    emoji: "🐙",
    description: "Repositories, issues, PRs & notifications",
    capabilities: ["Inspect repos & commits", "Read & create issues", "Check notifications", "Manage pull requests"],
    color: "from-slate-500/20 to-slate-600/10 border-slate-500/25",
    textColor: "text-slate-300",
  },
  {
    slug: "slack",
    displayName: "Slack",
    category: "Messaging",
    emoji: "💬",
    description: "Channels, direct messages & team files",
    capabilities: ["List workspace channels", "Read channel messages", "Send chat messages", "Upload files"],
    color: "from-purple-500/20 to-purple-600/10 border-purple-500/25",
    textColor: "text-purple-400",
  },
  {
    slug: "notion",
    displayName: "Notion",
    category: "Productivity",
    emoji: "📝",
    description: "Pages, databases & workspace docs",
    capabilities: ["Search pages & databases", "Create workspace pages", "Append database records"],
    color: "from-neutral-500/20 to-neutral-600/10 border-neutral-500/25",
    textColor: "text-neutral-300",
  },
  {
    slug: "googlecalendar",
    displayName: "Google Calendar",
    category: "Calendar",
    emoji: "📅",
    description: "Events, reminders & meeting scheduling",
    capabilities: ["List upcoming events", "Create meeting events", "Update schedule reminders"],
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/25",
    textColor: "text-blue-400",
  },
  {
    slug: "googledrive",
    displayName: "Google Drive",
    category: "Storage",
    emoji: "☁️",
    description: "Files, docs & cloud storage assets",
    capabilities: ["Search drive files", "Read document content", "Upload new files", "Share links"],
    color: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/25",
    textColor: "text-yellow-400",
  },
  {
    slug: "facebook",
    displayName: "Facebook",
    category: "Social",
    emoji: "📘",
    description: "Pages, feed posts & managed pages",
    capabilities: ["List managed pages", "Create page posts", "Get scheduled posts"],
    color: "from-blue-600/20 to-indigo-600/10 border-blue-500/25",
    textColor: "text-blue-400",
  },
  {
    slug: "linear",
    displayName: "Linear",
    category: "Project",
    emoji: "⚡",
    description: "Issue tracking, cycles & engineering roadmaps",
    capabilities: ["List active cycles & issues", "Create bug tickets", "Update issue status"],
    color: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/25",
    textColor: "text-indigo-400",
  },
  {
    slug: "twitter",
    displayName: "Twitter / X",
    category: "Social",
    emoji: "🐦",
    description: "Posts, timeline & direct messages",
    capabilities: ["Read timeline & mentions", "Post updates", "Search posts"],
    color: "from-sky-500/20 to-sky-600/10 border-sky-500/25",
    textColor: "text-sky-400",
  },
  {
    slug: "googlesheets",
    displayName: "Google Sheets",
    category: "Spreadsheet",
    emoji: "📊",
    description: "Spreadsheet data, formulas & tables",
    capabilities: ["Read sheet values", "Append data rows", "Update cell ranges"],
    color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/25",
    textColor: "text-emerald-400",
  },
  {
    slug: "googledocs",
    displayName: "Google Docs",
    category: "Productivity",
    emoji: "📄",
    description: "Documents, text files & markdown docs",
    capabilities: ["Search documents", "Read plaintext", "Update sections & markdown", "Replace text"],
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/25",
    textColor: "text-blue-400",
  },
  {
    slug: "googletasks",
    displayName: "Google Tasks",
    category: "Productivity",
    emoji: "✅",
    description: "Task lists, to-dos & completion status",
    capabilities: ["List tasks & lists", "Insert new task", "Patch & move task", "Delete task"],
    color: "from-amber-500/20 to-amber-600/10 border-amber-500/25",
    textColor: "text-amber-400",
  },
  {
    slug: "whatsapp",
    displayName: "WhatsApp",
    category: "Messaging",
    emoji: "🟢",
    description: "Send direct WhatsApp messages & templates",
    capabilities: ["Send chat message", "Get phone numbers", "Send template message"],
    color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/25",
    textColor: "text-emerald-400",
  },
];

export interface ConnectedAccountRecord {
  id: string;
  toolkitSlug: string;
  name: string;
  status: "connected" | "disconnected" | "expired";
  userId: string;
  connectedAccountId: string;
  displayConnectedAccountId: string;
  updatedAt: string;
}

export interface GroupedAppInfo {
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

interface AppCardState {
  loading: boolean;
  error: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ComposioConnectModal({ isOpen, onClose }: Props) {
  const [groupedApps, setGroupedApps] = useState<GroupedAppInfo[]>([]);
  const [totalTools, setTotalTools] = useState(0);
  const [entityId, setEntityId] = useState("aryan");
  const [statusLoading, setStatusLoading] = useState(true);
  const [cardStates, setCardStates] = useState<Record<string, AppCardState>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [successSlug, setSuccessSlug] = useState<string | null>(null);
  const [showExpiredSection, setShowExpiredSection] = useState(false);
  const [selectedAccountsMap, setSelectedAccountsMap] = useState<Record<string, string>>({});

  // Fetch connection status from server API
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/composio/status");
      const data = await res.json();
      if (data.connected && Array.isArray(data.apps)) {
        setGroupedApps(data.apps);
        setTotalTools(data.totalTools || 0);
        if (data.entityId) setEntityId(data.entityId);

        // Pre-populate selected accounts map
        const initialMap: Record<string, string> = {};
        data.apps.forEach((app: GroupedAppInfo) => {
          if (app.selectedAccountId) {
            initialMap[app.toolkitSlug] = app.selectedAccountId;
          } else if (app.activeAccounts && app.activeAccounts.length > 0) {
            initialMap[app.toolkitSlug] = app.activeAccounts[0].id;
          }
        });
        setSelectedAccountsMap(initialMap);
      } else {
        setGroupedApps([]);
        setTotalTools(0);
      }
    } catch {
      setGroupedApps([]);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchStatus();
  }, [isOpen, fetchStatus]);

  const getGroupedApp = (slug: string): GroupedAppInfo | undefined => {
    return groupedApps.find(
      (a) => a.toolkitSlug.toLowerCase() === slug.toLowerCase() || a.name.toLowerCase() === slug.toLowerCase()
    );
  };

  const getAppStatus = (slug: string): "connected" | "expired" | "disconnected" => {
    const app = getGroupedApp(slug);
    if (!app) return "disconnected";
    return app.status;
  };

  const handleConnect = async (slug: string) => {
    setCardStates((prev) => ({
      ...prev,
      [slug]: { loading: true, error: null },
    }));

    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: slug }),
      });

      const data = await res.json();

      if (data.error) {
        setCardStates((prev) => ({
          ...prev,
          [slug]: { loading: false, error: data.error },
        }));
        return;
      }

      if (data.redirectUrl) {
        window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
        setSuccessSlug(slug);
        setTimeout(() => setSuccessSlug(null), 8000);
        setTimeout(() => fetchStatus(), 5000);
      }

      setCardStates((prev) => ({
        ...prev,
        [slug]: { loading: false, error: null },
      }));
    } catch (err: any) {
      setCardStates((prev) => ({
        ...prev,
        [slug]: { loading: false, error: err.message || "Connection failed" },
      }));
    }
  };

  const handleDisconnect = async (connectedAccountId: string, slug: string) => {
    setCardStates((prev) => ({
      ...prev,
      [slug]: { loading: true, error: null },
    }));

    try {
      const res = await fetch("/api/composio/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchStatus();
      } else {
        setCardStates((prev) => ({
          ...prev,
          [slug]: { loading: false, error: data.error || "Disconnect failed" },
        }));
      }
    } catch (err: any) {
      setCardStates((prev) => ({
        ...prev,
        [slug]: { loading: false, error: err.message },
      }));
    }
  };

  const categories = ["All", "Dev", "Email", "Messaging", "Storage", "Productivity", "Calendar", "Social", "Integration"];

  // Dynamically include any connected app from groupedApps not hardcoded in APP_CATALOGUE
  const combinedCatalogue = [...APP_CATALOGUE];
  groupedApps.forEach((gApp) => {
    const exists = combinedCatalogue.some(
      (a) => a.slug.toLowerCase() === gApp.toolkitSlug.toLowerCase()
    );
    if (!exists) {
      combinedCatalogue.push({
        slug: gApp.toolkitSlug.toLowerCase(),
        displayName: gApp.name || gApp.toolkitSlug,
        category: "Integration",
        emoji: "🔌",
        description: `Connected ${gApp.name || gApp.toolkitSlug} toolkit with ${gApp.toolCount || 0} tools`,
        capabilities: gApp.availableTools?.slice(0, 4) || ["Use toolkit actions"],
        color: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/25",
        textColor: "text-indigo-400",
      });
    }
  });

  const filteredApps = combinedCatalogue.filter((app) => {
    const matchesSearch =
      app.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === "All" || app.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const totalActiveApps = groupedApps.filter((a) => a.connected).length;
  const expiredAccountsList = groupedApps.flatMap((a) => a.expiredAccounts);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="composio-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-white/10 bg-[#060611]/95 shadow-[0_0_90px_rgba(99,102,241,0.15)] overflow-hidden"
          >
            {/* Background Ambient Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[200px] bg-indigo-500/10 rounded-full blur-[90px] pointer-events-none" />

            {/* Header */}
            <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/15">
                  <Link2 size={20} className="text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white font-sans tracking-tight">Connected Applications</h2>
                    <span className="px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-[10px] font-mono text-indigo-300">
                      Entity: {entityId}
                    </span>
                    <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-mono text-emerald-300">
                      {totalTools} Discovered Tools
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Composio User-Scoped Session Tool Manager</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={fetchStatus}
                  disabled={statusLoading}
                  className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Refresh connection state"
                >
                  <RefreshCw size={15} className={statusLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="px-6 py-3.5 border-b border-white/8 bg-white/[0.015] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search apps or capabilities..."
                  className="w-full py-1.5 pl-9 pr-3 rounded-xl border border-white/10 bg-black/40 text-slate-200 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-indigo-500/50"
                />
                <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
                        : "bg-white/5 border border-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Apps Grid */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredApps.map((app) => {
                  const groupedInfo = getGroupedApp(app.slug);
                  const status = getAppStatus(app.slug);
                  const cardState = cardStates[app.slug] || { loading: false, error: null };
                  const isSuccess = successSlug === app.slug;
                  const activeAccounts = groupedInfo?.activeAccounts || [];
                  const toolCount = groupedInfo?.toolCount || 0;
                  const selectedId = selectedAccountsMap[app.slug] || (activeAccounts[0]?.id ?? null);

                  return (
                    <motion.div
                      key={app.slug}
                      className={`relative flex flex-col justify-between p-4.5 rounded-2xl border bg-gradient-to-br transition-all duration-200 ${
                        status === "connected"
                          ? "border-emerald-500/30 from-emerald-500/10 to-teal-950/20 shadow-[0_0_20px_rgba(16,185,129,0.08)]"
                          : status === "expired"
                          ? "border-amber-500/30 from-amber-500/10 to-yellow-950/20"
                          : `${app.color} hover:brightness-110`
                      }`}
                    >
                      <div>
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl leading-none select-none">{app.emoji}</span>
                            <div>
                              <h3 className="text-sm font-semibold text-white font-sans">{app.displayName}</h3>
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{app.category}</span>
                            </div>
                          </div>

                          {status === "connected" ? (
                            <span className="px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 text-[9px] font-mono text-emerald-300 uppercase tracking-wider flex items-center gap-1 font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Connected ({toolCount} Tools)
                            </span>
                          ) : status === "expired" ? (
                            <span className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-[9px] font-mono text-amber-300 uppercase tracking-wider flex items-center gap-1 font-bold">
                              Needs Re-Auth
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                              Not Connected
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-300 mb-3 leading-relaxed">{app.description}</p>

                        {/* Multi-Account Selector */}
                        {activeAccounts.length > 1 && (
                          <div className="mb-3 p-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
                            <label className="text-[10px] font-mono text-indigo-300 block mb-1 font-bold">
                              Active Account ({activeAccounts.length}):
                            </label>
                            <select
                              value={selectedId || ""}
                              onChange={(e) =>
                                setSelectedAccountsMap((prev) => ({ ...prev, [app.slug]: e.target.value }))
                              }
                              className="w-full bg-black/60 border border-white/15 rounded-lg py-1 px-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-400"
                            >
                              {activeAccounts.map((acc, idx) => (
                                <option key={acc.id} value={acc.id}>
                                  Account {idx + 1} ({acc.displayConnectedAccountId})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Capabilities overview */}
                        <div className="space-y-1 mb-4">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Capabilities</span>
                          {app.capabilities.slice(0, 3).map((cap, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <CheckCircle2 size={10} className="text-indigo-400 shrink-0" />
                              <span>{cap}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Success / Error Messages */}
                      <AnimatePresence>
                        {isSuccess && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-mono text-amber-300 flex items-center gap-1.5"
                          >
                            <ExternalLink size={11} />
                            OAuth browser tab opened — complete sign-in to authorize session
                          </motion.div>
                        )}
                        {cardState.error && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-3 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-mono text-rose-300 flex items-start gap-1.5"
                          >
                            <AlertCircle size={11} className="mt-0.5 shrink-0" />
                            <span>{cardState.error}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Action Controls */}
                      <div className="flex items-center gap-2 mt-auto">
                        <button
                          onClick={() => handleConnect(app.slug)}
                          disabled={cardState.loading}
                          className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                            status === "connected"
                              ? "border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300"
                              : status === "expired"
                              ? "border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300"
                              : "border border-indigo-500/30 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300"
                          }`}
                        >
                          {cardState.loading ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : status === "connected" ? (
                            <>
                              <RefreshCw size={12} /> Reconnect / Add Account
                            </>
                          ) : (
                            <>
                              <ExternalLink size={12} /> Connect <ChevronRight size={12} />
                            </>
                          )}
                        </button>

                        {status === "connected" && selectedId && (
                          <button
                            onClick={() => handleDisconnect(selectedId, app.slug)}
                            disabled={cardState.loading}
                            title="Disconnect selected account"
                            className="p-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Collapsed Expired Connections Section */}
              {expiredAccountsList.length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/10">
                  <button
                    onClick={() => setShowExpiredSection(!showExpiredSection)}
                    className="flex items-center justify-between w-full p-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-mono font-bold transition hover:bg-amber-500/15"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} />
                      <span>Expired Connections ({expiredAccountsList.length})</span>
                    </div>
                    {showExpiredSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  <AnimatePresence>
                    {showExpiredSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 space-y-2 overflow-hidden"
                      >
                        {expiredAccountsList.map((acc) => (
                          <div
                            key={acc.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-black/40 text-xs font-mono text-slate-300"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-amber-400 font-bold uppercase">{acc.toolkitSlug}</span>
                              <span className="text-slate-500">ID: {acc.displayConnectedAccountId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleConnect(acc.toolkitSlug)}
                                className="px-3 py-1 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition cursor-pointer"
                              >
                                Reconnect
                              </button>
                              <button
                                onClick={() => handleDisconnect(acc.id, acc.toolkitSlug)}
                                className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                                title="Remove old connection"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Footer Summary */}
            <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.01] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Credentials managed securely by Composio Session Router — entity: {entityId}</span>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
