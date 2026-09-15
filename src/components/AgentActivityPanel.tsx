import React, { useState, useEffect } from "react";
import {
  Bot,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Layers,
  StopCircle,
  RotateCcw,
  ShieldAlert,
  Globe,
  Check,
  X,
  History,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface AgentActivity {
  status: "idle" | "thinking" | "executing" | "awaiting_confirmation" | "success" | "error";
  action?: string;
  summary?: string;
  timestamp?: string;
  stepIndex?: number;
  totalSteps?: number;
  browserActivity?: string;
  planId?: string;
  redirectUrl?: string;
  appName?: string;
}

export interface ComposioConfirmationData {
  callId: string;
  action: string;
  params: any;
  confirmationMessage: string;
}

interface ConnectedAppInfo {
  name: string;
  displayName: string;
  toolCount: number;
}

interface AgentActivityPanelProps {
  currentActivity: AgentActivity;
  onOpenComposioModal?: () => void;
  onCancelTask?: (planId?: string) => void;
  onRetryTask?: (action: string, params?: any) => void;
  confirmationData?: ComposioConfirmationData | null;
  onConfirmAction?: (confirmed: boolean, callId: string) => void;
}

export function AgentActivityPanel({
  currentActivity,
  onOpenComposioModal,
  onCancelTask,
  onRetryTask,
  confirmationData,
  onConfirmAction,
}: AgentActivityPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const [composioStatus, setComposioStatus] = useState<{ connected: boolean; apps: ConnectedAppInfo[]; totalTools: number }>({
    connected: false,
    apps: [],
    totalTools: 0,
  });
  const [history, setHistory] = useState<AgentActivity[]>([]);

  // Fetch Composio connection status on mount & periodic polling
  useEffect(() => {
    const checkStatus = () => {
      fetch("/api/composio/status")
        .then((res) => res.json())
        .then((data) => {
          if (data.connected) {
            setComposioStatus({
              connected: true,
              apps: data.apps || [],
              totalTools: data.totalTools || 0,
            });
          }
        })
        .catch(() => {});
    };
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sync execution history log
  useEffect(() => {
    if (currentActivity.action && currentActivity.status !== "idle") {
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.action !== currentActivity.action);
        return [{ ...currentActivity, timestamp: new Date().toLocaleTimeString() }, ...filtered].slice(0, 10);
      });
    }
  }, [currentActivity]);

  const getStatusInfo = () => {
    switch (currentActivity.status) {
      case "thinking":
      case "executing":
        return {
          label: currentActivity.summary || "Alya is executing plan...",
          color: "border-cyan-500/30 text-cyan-300 bg-cyan-500/10",
          icon: Sparkles,
          animate: true,
        };
      case "awaiting_confirmation":
        return {
          label: currentActivity.summary || "Awaiting confirmation",
          color: "border-amber-500/30 text-amber-300 bg-amber-500/10",
          icon: Clock,
          animate: true,
        };
      case "success":
        return {
          label: currentActivity.summary || "Task completed",
          color: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10",
          icon: CheckCircle2,
          animate: false,
        };
      case "error":
        return {
          label: currentActivity.summary || "Action failed",
          color: "border-red-500/30 text-red-300 bg-red-500/10",
          icon: AlertCircle,
          animate: false,
        };
      default:
        return {
          label: "Alya Unified Agent Ready",
          color: "border-white/10 text-slate-400 bg-white/5",
          icon: Bot,
          animate: false,
        };
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;

  return (
    <>
      {/* Floating Confirmation Modal for Sensitive Actions */}
      <AnimatePresence>
        {confirmationData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md font-sans"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md p-6 rounded-3xl border border-amber-500/30 bg-[#0c0a04]/95 shadow-[0_0_50px_rgba(245,158,11,0.2)] text-left"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-2xl border border-amber-500/40 bg-amber-500/15 text-amber-400">
                  <ShieldAlert size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-200">Confirmation Required</h3>
                  <p className="text-xs text-amber-400/80 font-mono">{confirmationData.action}</p>
                </div>
              </div>

              <p className="text-sm text-slate-200 mb-6 leading-relaxed bg-amber-500/5 p-3 rounded-xl border border-amber-500/15">
                {confirmationData.confirmationMessage}
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => onConfirmAction?.(true, confirmationData.callId)}
                  className="flex-1 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Check size={14} /> Confirm & Execute
                </button>
                <button
                  onClick={() => onConfirmAction?.(false, confirmationData.callId)}
                  className="flex-1 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Activity HUD */}
      <div className="fixed bottom-6 right-6 z-30 font-sans">
        <motion.div
          layout
          className="bg-[#04040d]/90 border border-white/15 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden min-w-[300px] max-w-[380px]"
        >
          {/* Header Bar */}
          <div
            onClick={() => setExpanded(!expanded)}
            className="p-3.5 px-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition select-none"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`p-2 rounded-xl border ${statusInfo.color} shrink-0`}>
                <Icon size={15} className={statusInfo.animate ? "animate-pulse" : ""} />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Agent Activity</span>
                  {currentActivity.stepIndex && currentActivity.totalSteps && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">
                      Step {currentActivity.stepIndex}/{currentActivity.totalSteps}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-200 truncate block mt-0.5">{statusInfo.label}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {currentActivity.status === "executing" && onCancelTask && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelTask(currentActivity.planId);
                  }}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition text-[10px] font-mono flex items-center gap-1 px-2"
                  title="Cancel active task"
                >
                  <StopCircle size={12} /> Stop
                </button>
              )}
              <button className="text-slate-400 hover:text-white transition">
                {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
          </div>

          {/* Browser Activity Compact Bar */}
          {currentActivity.browserActivity && (
            <div className="px-4 py-1.5 bg-indigo-950/40 border-t border-white/5 flex items-center gap-2 text-[11px] text-indigo-300 font-mono">
              <Globe size={12} className="animate-spin text-indigo-400" />
              <span className="truncate">{currentActivity.browserActivity}</span>
            </div>
          )}

          {/* Composio Unconnected App Direct Connection Action Bar */}
          {currentActivity.redirectUrl && (
            <div className="px-4 py-2 bg-amber-500/15 border-t border-amber-500/30 flex items-center justify-between gap-2 text-xs font-mono text-amber-200">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <ExternalLink size={13} className="text-amber-400 shrink-0" />
                <span className="truncate">App Sign-in Required</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(currentActivity.redirectUrl, "_blank", "noopener,noreferrer");
                }}
                className="px-2.5 py-1 rounded-lg border border-amber-400 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[10px] uppercase tracking-wider transition cursor-pointer shrink-0"
              >
                Open Chrome Tab
              </button>
            </div>
          )}

          {/* Expanded Panel */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-white/10 p-4 space-y-4 bg-black/50"
              >
                {/* Panel Tabs */}
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <button
                    onClick={() => setActiveTab("live")}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                      activeTab === "live" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Live Status
                  </button>
                  <button
                    onClick={() => setActiveTab("history")}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "history" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <History size={12} /> History ({history.length})
                  </button>
                </div>

                {activeTab === "live" ? (
                  <>
                    {/* Connected App Badges */}
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2">Connected Apps</span>
                      {composioStatus.connected && composioStatus.apps.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {composioStatus.apps.map((app) => (
                            <span
                              key={app.name}
                              className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] font-medium text-slate-300 flex items-center gap-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {app.displayName || app.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic font-mono">No Composio apps connected yet.</p>
                      )}
                    </div>

                    {/* Manage Composio Button */}
                    {onOpenComposioModal && (
                      <button
                        onClick={onOpenComposioModal}
                        className="w-full py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-mono text-cyan-300 font-medium tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Layers size={14} />
                        <span>OPEN CONNECTED APPS PANEL</span>
                      </button>
                    )}
                  </>
                ) : (
                  /* History Tab */
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll">
                    {history.length === 0 ? (
                      <p className="text-xs text-slate-500 italic font-mono">No recent actions recorded.</p>
                    ) : (
                      history.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            {item.status === "success" ? (
                              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                            ) : item.status === "error" ? (
                              <AlertCircle size={13} className="text-red-400 shrink-0" />
                            ) : (
                              <Sparkles size={13} className="text-cyan-400 shrink-0 animate-pulse" />
                            )}
                            <div className="overflow-hidden">
                              <span className="text-slate-300 font-mono text-[11px] truncate block">{item.action || "Action"}</span>
                              {item.summary && <span className="text-[10px] text-slate-500 truncate block">{item.summary}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[9px] font-mono text-slate-500">{item.timestamp}</span>
                            {item.status === "error" && onRetryTask && (
                              <button
                                onClick={() => onRetryTask(item.action || "")}
                                title="Retry failed action"
                                className="p-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition cursor-pointer"
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
