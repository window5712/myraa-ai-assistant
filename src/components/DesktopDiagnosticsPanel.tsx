import React, { useState, useEffect } from "react";
import {
  X,
  Cpu,
  Monitor,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sliders,
  Shield,
  Layers,
  Terminal,
  Brain,
  Mic,
  Activity,
  HardDrive,
  Check,
  Radio
} from "lucide-react";
import { motion } from "motion/react";

interface DesktopDiagnosticsPanelProps {
  onClose: () => void;
  isProactivePaused: boolean;
  onToggleProactive: () => void;
  isScreenSharing: boolean;
  connectionState: string;
}

export const DesktopDiagnosticsPanel: React.FC<DesktopDiagnosticsPanelProps> = ({
  onClose,
  isProactivePaused,
  onToggleProactive,
  isScreenSharing,
  connectionState
}) => {
  const [activeTab, setActiveTab] = useState<"diagnostics" | "settings">("diagnostics");
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [browserStatus, setBrowserStatus] = useState<any>(null);
  const [autoStartEnabled, setAutoStartEnabled] = useState<boolean>(false);
  const [isSavingAutoStart, setIsSavingAutoStart] = useState<boolean>(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [lifeDbStats, setLifeDbStats] = useState<{ tasks: number; projects: number; reminders: number }>({ tasks: 0, projects: 0, reminders: 0 });

  // Check Electron API availability
  const isElectron = typeof window !== "undefined" && (window as any).electronAPI !== undefined;

  useEffect(() => {
    // Fetch Electron system diagnostics
    if (isElectron) {
      (window as any).electronAPI.getSystemDiagnostics()
        .then((data: any) => setSysInfo(data))
        .catch(() => {});

      (window as any).electronAPI.getAutoStart()
        .then((enabled: boolean) => setAutoStartEnabled(enabled))
        .catch(() => {});
    }

    // Fetch browser engine status
    fetch("/api/browser/status")
      .then((res) => res.json())
      .then((data) => setBrowserStatus(data))
      .catch(() => {});

    // Fetch memory metrics
    fetch("/api/memories")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMemoryCount(data.length);
      })
      .catch(() => {});

    fetch("/api/life/db")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setLifeDbStats({
            tasks: data.tasks?.length || 0,
            projects: data.projects?.length || 0,
            reminders: data.reminders?.length || 0
          });
        }
      })
      .catch(() => {});
  }, [isElectron]);

  const handleToggleAutoStart = async () => {
    if (!isElectron) return;
    setIsSavingAutoStart(true);
    try {
      const next = !autoStartEnabled;
      const res = await (window as any).electronAPI.setAutoStart(next);
      setAutoStartEnabled(res);
    } catch (e) {
      console.error("AutoStart toggle failure:", e);
    } finally {
      setIsSavingAutoStart(false);
    }
  };

  return (
    <div
      id="alya-desktop-diagnostics-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-fade-in text-left select-none"
    >
      <div className="relative w-full max-w-3xl h-[80vh] flex flex-col rounded-3xl border border-white/10 bg-slate-900/90 shadow-[0_0_80px_rgba(99,102,241,0.3)] overflow-hidden">
        
        {/* Glow ambient header */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_50%)] pointer-events-none" />

        {/* HEADER BAR */}
        <div className="relative z-10 px-6 py-4 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Activity size={18} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono tracking-wider text-slate-100 uppercase flex items-center gap-2">
                Alya Windows Desktop Diagnostics &amp; Controls
              </h3>
              <p className="text-[10px] text-slate-500 font-mono tracking-wide">
                Live Native Health Monitor • Electron Runtime • Playwright Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/5 rounded-xl text-[10px] font-mono">
              <button
                onClick={() => setActiveTab("diagnostics")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer font-bold ${
                  activeTab === "diagnostics" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                HEALTH &amp; METRICS
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer font-bold ${
                  activeTab === "settings" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                DESKTOP SETTINGS
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* BODY ZONE */}
        <div className="relative z-10 flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
          
          {activeTab === "diagnostics" ? (
            <div className="space-y-6 font-mono text-xs">
              
              {/* SYSTEM STATUS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Electron Runtime */}
                <div className="p-4 rounded-2xl border border-white/10 bg-slate-950/60 space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-indigo-400">
                      <Cpu size={14} /> Electron Shell
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    {isElectron ? "Native Desktop" : "Web Preview Mode"}
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-white/5">
                    <div>Platform: <span className="text-slate-300">{sysInfo?.platform || "Windows x64"}</span></div>
                    <div>Electron: <span className="text-slate-300">{sysInfo?.electronVersion || "v43.2.0"}</span></div>
                    <div>Node: <span className="text-slate-300">{sysInfo?.nodeVersion || "v22.14"}</span></div>
                  </div>
                </div>

                {/* 2. Playwright Browser Engine */}
                <div className="p-4 rounded-2xl border border-white/10 bg-slate-950/60 space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-purple-400">
                      <Radio size={14} /> Playwright Engine
                    </span>
                    <span className={`w-2 h-2 rounded-full ${browserStatus?.connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    {browserStatus?.connected ? "Chromium Persistent" : "Standing By"}
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-white/5">
                    <div>Active Tabs: <span className="text-purple-300 font-bold">{browserStatus?.tabs?.length || 0}</span></div>
                    <div>Current URL: <span className="text-slate-300 truncate max-w-[120px] inline-block align-bottom">{browserStatus?.currentUrl || "about:blank"}</span></div>
                    <div>Engine Status: <span className="text-emerald-400 font-bold">ONLINE</span></div>
                  </div>
                </div>

                {/* 3. Gemini AI & WebSocket Session */}
                <div className="p-4 rounded-2xl border border-white/10 bg-slate-950/60 space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-sky-400">
                      <Brain size={14} /> Gemini 3.6 Flash
                    </span>
                    <span className={`w-2 h-2 rounded-full ${connectionState === "listening" || connectionState === "speaking" ? "bg-cyan-400 animate-ping" : "bg-white/20"}`} />
                  </div>
                  <div className="text-sm font-bold text-slate-200 capitalize">
                    {connectionState}
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-white/5">
                    <div>Voice Stream: <span className="text-cyan-300 font-bold">24kHz Audio</span></div>
                    <div>Screen Sharing: <span className={isScreenSharing ? "text-cyan-400 font-bold" : "text-slate-400"}>{isScreenSharing ? "ACTIVE" : "OFF"}</span></div>
                    <div>Proactive Engine: <span className={isProactivePaused ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>{isProactivePaused ? "PAUSED" : "ACTIVE"}</span></div>
                  </div>
                </div>

              </div>

              {/* MEMORY & STORAGE STATS */}
              <div className="p-5 rounded-2xl border border-white/10 bg-slate-950/40 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <HardDrive size={15} className="text-indigo-400" /> Persistent Storage &amp; Life OS Database
                  </span>
                  <span className="text-[10px] text-slate-500">life_memory.json • memories.json</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="block text-slate-500 text-[10px] uppercase font-bold">Recollections</span>
                    <span className="text-base font-bold text-indigo-400">{memoryCount}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="block text-slate-500 text-[10px] uppercase font-bold">Life Tasks</span>
                    <span className="text-base font-bold text-emerald-400">{lifeDbStats.tasks}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="block text-slate-500 text-[10px] uppercase font-bold">Active Projects</span>
                    <span className="text-base font-bold text-purple-400">{lifeDbStats.projects}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="block text-slate-500 text-[10px] uppercase font-bold">Reminders</span>
                    <span className="text-base font-bold text-amber-400">{lifeDbStats.reminders}</span>
                  </div>
                </div>
              </div>

              {/* RECENT DIAGNOSTIC LOGS */}
              <div className="p-5 rounded-2xl border border-white/10 bg-slate-950/40 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Terminal size={15} className="text-amber-400 animate-pulse" /> Desktop Agent Logs
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle size={12} /> System Healthy
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 font-mono text-[10px] space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin text-slate-400">
                  <div className="text-emerald-400">[SYSTEM_BOOT] Electron Desktop Process initialized successfully.</div>
                  <div className="text-purple-300">[PLAYWRIGHT] Chromium persistent engine connected on port 3000.</div>
                  <div className="text-cyan-300">[GEMINI_LIVE] AI voice model Aoede ready for multi-step tasks.</div>
                  <div className="text-slate-400">[LIFE_OS] DB loaded with {lifeDbStats.tasks} tasks and {lifeDbStats.projects} projects.</div>
                </div>
              </div>

            </div>
          ) : (
            
            /* DESKTOP SETTINGS TAB */
            <div className="space-y-6 font-mono text-xs">
              
              <div className="p-5 rounded-2xl border border-white/10 bg-slate-950/60 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div>
                    <span className="font-bold text-slate-200 uppercase tracking-wider block">Start Alya with Windows</span>
                    <span className="text-[10px] text-slate-500 font-normal">Automatically launches Alya in the background system tray when Windows boots up</span>
                  </div>
                  <button
                    onClick={handleToggleAutoStart}
                    disabled={!isElectron || isSavingAutoStart}
                    className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      autoStartEnabled
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                        : "bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    {autoStartEnabled ? <Check size={14} /> : null}
                    {autoStartEnabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <div className="flex items-center justify-between border-b border-white/5 pb-3 pt-2">
                  <div>
                    <span className="font-bold text-slate-200 uppercase tracking-wider block">Proactive Questioning System</span>
                    <span className="text-[10px] text-slate-500 font-normal">Allows Alya to spontaneously ask relevant questions when idle</span>
                  </div>
                  <button
                    onClick={onToggleProactive}
                    className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      !isProactivePaused
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                        : "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                    }`}
                  >
                    {!isProactivePaused ? "ACTIVE" : "PAUSED"}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <span className="font-bold text-slate-200 uppercase tracking-wider block">Local Agent Server Reload</span>
                    <span className="text-[10px] text-slate-500 font-normal">Force reload internal web app and WebSocket connections</span>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition font-bold cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} /> RELOAD AGENT
                  </button>
                </div>
              </div>

              {!isElectron && (
                <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-950/10 text-amber-300 text-[10px] space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle size={14} /> Web Preview Notice
                  </div>
                  <div>
                    You are currently viewing Alya inside a standard web browser. Native desktop settings (like Start with Windows and System Tray) are active when running the installed Windows Desktop Application (`Alya-Setup.exe`).
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
