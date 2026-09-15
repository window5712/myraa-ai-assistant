import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  ExternalLink, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  Terminal, 
  Copy, 
  Check, 
  Layers, 
  Globe, 
  RefreshCw, 
  ArrowLeft,
  ArrowRight,
  Home,
  Plus,
  Search,
  Monitor,
  Play,
  Volume2,
  Maximize,
  Sparkles,
  Shield,
  BookOpen,
  MousePointer,
  Radio
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LogItem {
  id: string;
  timestamp?: string;
  text: string;
  type: "info" | "success" | "error" | "action" | "warn";
  category?: string;
}

interface Tab {
  id: string;
  url: string;
  title: string;
  history: string[];
  currentIndex: number;
  isLoading: boolean;
  openedExternally?: boolean;
}

interface BrowserAgentProps {
  url: string;
  onClose: () => void;
  onActionComplete?: (result: any) => void;
  actionTrigger?: {
    type: string;
    args: any;
    id: string;
    callback: (res: any) => void;
  } | null;
}

export const BrowserAgent: React.FC<BrowserAgentProps> = ({
  url: initialUrl,
  onClose,
  actionTrigger
}) => {
  // Tabs management state
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");

  // Playwright persistent engine status states
  const [isLocalConnected, setIsLocalConnected] = useState<boolean>(false);
  const [localLogs, setLocalLogs] = useState<LogItem[]>([]);
  const [showLocalConsole, setShowLocalConsole] = useState<boolean>(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Diagnostics & Debug Parameters
  const [diagnosticCategory, setDiagnosticCategory] = useState<string | null>(null);
  const [diagnosticReason, setDiagnosticReason] = useState<string | null>(null);
  const [diagnosticStatus, setDiagnosticStatus] = useState<"secure" | "restricted" | "error" | "analyzing" | "blank">("blank");
  const [jsErrors, setJsErrors] = useState<string[]>([]);
  const [loadTimeMs, setLoadTimeMs] = useState<number>(0);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(true);
  const [iframeOnLoadCount, setIframeOnLoadCount] = useState<number>(0);
  const [frameTimestamp, setFrameTimestamp] = useState<number>(Date.now());
  const [viewMode, setViewMode] = useState<"playwright" | "embed">("playwright");

  // YouTube Live results states
  const [ytSearchResults, setYtSearchResults] = useState<any[]>([]);
  const [ytSearchLoading, setYtSearchLoading] = useState<boolean>(false);
  const [ytSearchError, setYtSearchError] = useState<string | null>(null);

  const loadStartRef = useRef<number>(0);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Poll backend Playwright browser status & diagnostic logs
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/browser/status");
        if (res.ok && isMounted) {
          const data = await res.json();
          setIsLocalConnected(data.connected || false);
          if (data.logs && Array.isArray(data.logs)) {
            setLocalLogs(data.logs);
          }
          if (data.lastErrorCategory && data.lastErrorMessage) {
            setDiagnosticCategory(data.lastErrorCategory);
            setDiagnosticReason(data.lastErrorMessage);
          }
        }
      } catch (err) {
        if (isMounted) {
          setIsLocalConnected(false);
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Periodic frame refresh when page is loading or active
  useEffect(() => {
    if (!activeTab || activeTab.url === "about:blank") return;
    const frameInterval = setInterval(() => {
      setFrameTimestamp(Date.now());
    }, 1500);
    return () => clearInterval(frameInterval);
  }, [activeTabId, activeTab?.url]);

  // Clean initial tab setup
  useEffect(() => {
    if (initialUrl) {
      const startUrl = initialUrl === "about:blank" ? "about:blank" : initialUrl;
      const newTab: Tab = {
        id: Math.random().toString(36).substring(2, 9),
        url: startUrl,
        title: getCleanTitleFromUrl(startUrl),
        history: [startUrl],
        currentIndex: 0,
        isLoading: startUrl !== "about:blank",
        openedExternally: false,
      };

      setTabs([newTab]);
      setActiveTabId(newTab.id);
      setInputValue(startUrl === "about:blank" ? "" : startUrl);

      if (startUrl !== "about:blank") {
        navigateToUrl(startUrl);
      } else {
        setDiagnosticStatus("blank");
      }
    }
  }, [initialUrl]);

  // Sync address input when active tab changes
  useEffect(() => {
    if (activeTab) {
      setInputValue(activeTab.url === "about:blank" ? "" : activeTab.url);

      if (activeTab.url.includes("youtube.com/results")) {
        setYtSearchLoading(true);
        setYtSearchError(null);
        try {
          const urlObj = new URL(activeTab.url);
          const q = urlObj.searchParams.get("search_query") || "";

          fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`)
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP status ${res.status}`);
              return res.json();
            })
            .then((data) => {
              setYtSearchResults(data.results || []);
              setYtSearchLoading(false);
              setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t)));
            })
            .catch((err) => {
              console.error("[YouTube Search Error]:", err);
              setYtSearchError(err.message || "Failed loading real YouTube results.");
              setYtSearchLoading(false);
              setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t)));
            });
        } catch (e: any) {
          setYtSearchError("Invalid YouTube search URL structure.");
          setYtSearchLoading(false);
        }
      } else {
        setYtSearchResults([]);
      }
    }
  }, [activeTabId, activeTab?.url]);

  // Automated voice trigger processing via backend Playwright engine
  useEffect(() => {
    if (!actionTrigger) return;

    const { type, args, callback } = actionTrigger;
    console.log(`[Alya Browser Engine] Voice Trigger: ${type}`, args);

    const runVoiceAutomation = async () => {
      try {
        if (type === "browserOpen") {
          const destUrl = args.url || "https://google.com";
          await navigateToUrl(destUrl);
          const cleanTitle = getCleanTitleFromUrl(destUrl);
          callback({ result: `Opened ${cleanTitle} directly in Playwright browser engine.` });
        } else {
          const res = await fetch("/api/browser/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, args }),
          });
          const data = await res.json();
          setFrameTimestamp(Date.now());
          if (data.success) {
            callback({ result: data.result?.result || `Executed ${type} successfully.` });
          } else {
            callback({ error: data.error || `Failed executing ${type}` });
          }
        }
      } catch (err: any) {
        callback({ error: `Automation exception: ${err.message}` });
      }
    };

    runVoiceAutomation();
  }, [actionTrigger, activeTabId]);

  // Utility to map clean tab titles
  const getCleanTitleFromUrl = (urlStr: string): string => {
    if (!urlStr || urlStr === "about:blank") return "Start Page";
    try {
      const parsed = new URL(urlStr);
      if (parsed.hostname.includes("youtube.com")) {
        if (parsed.searchParams.get("v")) return "YouTube Stream";
        if (parsed.pathname.includes("/results")) return `YouTube Search: ${parsed.searchParams.get("search_query") || ""}`;
        return "YouTube Portal";
      }
      if (parsed.hostname.includes("google.com")) {
        if (parsed.pathname.includes("search")) return `Google Results: ${parsed.searchParams.get("q") || ""}`;
        return "Google Search";
      }
      if (parsed.hostname.includes("github.com")) {
        return "GitHub Portal";
      }
      return parsed.hostname.replace("www.", "");
    } catch {
      return "Web Portal";
    }
  };

  // Primary Playwright engine direct navigation
  const navigateToUrl = async (targetUrl: string) => {
    const finalUrl = targetUrl.trim();
    if (finalUrl === "about:blank") {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                url: "about:blank",
                title: "Start Page",
                history: [...t.history.slice(0, t.currentIndex + 1), "about:blank"],
                currentIndex: t.currentIndex + 1,
                isLoading: false,
              }
            : t
        )
      );
      setDiagnosticStatus("blank");
      setDiagnosticCategory(null);
      setDiagnosticReason(null);
      return;
    }

    loadStartRef.current = Date.now();
    setDiagnosticStatus("analyzing");
    setDiagnosticCategory(null);
    setDiagnosticReason(null);

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          const nextHistory = t.history.slice(0, t.currentIndex + 1);
          nextHistory.push(finalUrl);
          return {
            ...t,
            url: finalUrl,
            title: getCleanTitleFromUrl(finalUrl),
            history: nextHistory,
            currentIndex: nextHistory.length - 1,
            isLoading: true,
          };
        }
        return t;
      })
    );

    try {
      const resp = await fetch("/api/browser/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl, tabId: activeTabId }),
      });

      const data = await resp.json();
      const dur = Date.now() - loadStartRef.current;
      setLoadTimeMs(dur);

      if (data.success) {
        const resolvedUrl = data.url || finalUrl;
        const pageTitle = data.title || getCleanTitleFromUrl(resolvedUrl);

        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  url: resolvedUrl,
                  title: pageTitle,
                  isLoading: false,
                }
              : t
          )
        );

        setDiagnosticStatus("secure");
        setDiagnosticCategory(null);
        setDiagnosticReason(null);
        setFrameTimestamp(Date.now());
        setIframeOnLoadCount((prev) => prev + 1);
      } else {
        setDiagnosticStatus("error");
        setDiagnosticCategory(data.category || "BROWSER_NAVIGATION_ERROR");
        setDiagnosticReason(data.error || "Failed to load website in Playwright browser.");
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t)));
      }
    } catch (err: any) {
      const dur = Date.now() - loadStartRef.current;
      setLoadTimeMs(dur);
      setDiagnosticStatus("error");
      setDiagnosticCategory("NETWORK_ERROR");
      setDiagnosticReason(`Network exception communicating with backend browser: ${err.message}`);
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t)));
    }
  };

  // Handles relative coordinate clicks on Playwright viewport image
  const handleViewportClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;

    const targetX = Math.round(clickX * scaleX);
    const targetY = Math.round(clickY * scaleY);

    try {
      await fetch("/api/browser/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "browserClick",
          args: { x: targetX, y: targetY },
        }),
      });
      setTimeout(() => setFrameTimestamp(Date.now()), 300);
    } catch (err) {
      console.error("Viewport click error:", err);
    }
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      navigateToUrl(inputValue);
    }
  };

  const handleNewTab = (initialUrlStr: string = "about:blank") => {
    const newTab: Tab = {
      id: Math.random().toString(36).substring(2, 9),
      url: initialUrlStr,
      title: getCleanTitleFromUrl(initialUrlStr),
      history: [initialUrlStr],
      currentIndex: 0,
      isLoading: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (idToClose: string) => {
    if (tabs.length <= 1) {
      onClose();
      return;
    }
    const idx = tabs.findIndex((t) => t.id === idToClose);
    const updated = tabs.filter((t) => t.id !== idToClose);
    setTabs(updated);

    if (activeTabId === idToClose) {
      const fallbackIdx = Math.max(0, idx - 1);
      setActiveTabId(updated[fallbackIdx].id);
    }
  };

  const handleBack = () => {
    if (activeTab && activeTab.currentIndex > 0) {
      const targetIdx = activeTab.currentIndex - 1;
      const prevUrl = activeTab.history[targetIdx];
      navigateToUrl(prevUrl);
    }
  };

  const handleForward = () => {
    if (activeTab && activeTab.currentIndex < activeTab.history.length - 1) {
      const targetIdx = activeTab.currentIndex + 1;
      const nextUrl = activeTab.history[targetIdx];
      navigateToUrl(nextUrl);
    }
  };

  const handleRefresh = () => {
    if (activeTab) {
      navigateToUrl(activeTab.url);
    }
  };

  const copyToClipboard = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(identifier);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div
      id="alya-playwright-automation-hud"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-fade-in text-left select-none"
    >
      <div className="relative w-full max-w-5xl h-[88vh] flex flex-col rounded-3xl border border-white/10 bg-slate-900/85 shadow-[0_0_90px_rgba(168,85,247,0.4)] overflow-hidden">
        
        {/* Ambient aesthetic light streams */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.1),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.005)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.005)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none opacity-20" />

        {/* 1. TABS NAVIGATION RAIL */}
        <div className="relative z-10 px-4 pt-4 pb-1 border-b border-white/5 bg-slate-950/70 flex items-end justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-[70%]">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl transition-all duration-200 cursor-pointer text-xs font-mono select-none outline-none ${
                    isActive 
                      ? "bg-slate-900 border border-b-transparent border-white/10 text-white font-semibold shadow-inner" 
                      : "text-slate-500 hover:text-slate-300 bg-transparent hover:bg-white/5"
                  }`}
                >
                  <Globe size={11} className={tab.isLoading ? "animate-spin text-purple-400" : isActive ? "text-indigo-400" : "text-slate-500"} />
                  <span className="truncate max-w-[120px]">{tab.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                    className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => handleNewTab()}
              className="p-1 px-1.5 ml-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Spawn New Tab"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex items-center gap-3 pb-2.5">
            {/* View Mode Toggle */}
            <button
              onClick={() => setViewMode(viewMode === "playwright" ? "embed" : "playwright")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono tracking-wider font-extrabold cursor-pointer transition ${
                viewMode === "playwright"
                  ? "bg-purple-900/30 border-purple-500/40 text-purple-300"
                  : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
              }`}
              title="Switch between Playwright Stream Engine and Direct Viewer"
            >
              <Radio size={12} className={viewMode === "playwright" ? "text-purple-400 animate-pulse" : ""} />
              <span>{viewMode === "playwright" ? "PLAYWRIGHT STREAM" : "EMBED VIEW"}</span>
            </button>

            {/* Developer debug panel toggle */}
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono tracking-wider font-extrabold cursor-pointer transition ${
                showDebugPanel 
                  ? "bg-amber-900/20 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]" 
                  : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
              }`}
            >
              <Terminal size={12} className={showDebugPanel ? "text-amber-400 animate-pulse" : ""} />
              <span>DIAGNOSTICS {showDebugPanel ? "ON" : "OFF"}</span>
            </button>

            <button
              onClick={() => setShowLocalConsole(!showLocalConsole)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono tracking-wider font-extrabold cursor-pointer transition ${
                showLocalConsole 
                  ? "bg-purple-900/20 border-purple-500/30 text-purple-400" 
                  : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
              }`}
            >
              <Cpu size={12} />
              <span>ENGINE LOGS</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 px-3 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/30 text-rose-300 hover:text-rose-100 transition font-sans text-xs cursor-pointer flex items-center gap-1"
            >
              <X size={13} /> Close
            </button>
          </div>
        </div>

        {/* 2. CHROME NAVIGATION INTERFACE BAR */}
        <div className="relative z-10 px-5 py-3 border-b border-white/5 bg-slate-900/80 flex items-center gap-3.5 shadow-md">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              disabled={!activeTab || activeTab.currentIndex <= 0}
              className="p-2 rounded-xl transition text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:hover:bg-transparent cursor-pointer"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>

            <button
              onClick={handleForward}
              disabled={!activeTab || activeTab.currentIndex >= activeTab.history.length - 1}
              className="p-2 rounded-xl transition text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:hover:bg-transparent cursor-pointer"
              title="Forward"
            >
              <ArrowRight size={16} />
            </button>

            <button
              onClick={handleRefresh}
              disabled={!activeTab || activeTab.url === "about:blank"}
              className="p-2 rounded-xl transition text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-20 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={14} className={activeTab?.isLoading ? "animate-spin" : ""} />
            </button>

            <button
              onClick={() => navigateToUrl("about:blank")}
              className="p-2 rounded-xl transition text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              title="Home Start Page"
            >
              <Home size={15} />
            </button>
          </div>

          <form onSubmit={handleAddressSubmit} className="flex-1 relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type URL or query (e.g. open YouTube, google.com, github)..."
              className="w-full py-2 pl-10 pr-12 rounded-xl border border-white/10 bg-slate-950/70 text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/40 tracking-wide transition font-mono"
            />
            <Search size={14} className="absolute left-3.5 text-slate-500" />
            <button
              type="submit"
              className="absolute right-2 text-[10px] font-mono tracking-widest uppercase font-bold text-slate-400 hover:text-purple-400 transition"
            >
              Go
            </button>
          </form>
        </div>

        {/* 3. CORE DISPLAY BODY */}
        <div className="relative z-10 flex-1 flex overflow-hidden">
          
          {/* MAIN WEBPAGE ZONE */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#07070c] relative">
            
            {activeTab?.url === "about:blank" ? (
              
              // HOME DASHBOARD INTERFACE
              <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center space-y-8 select-none text-center scrollbar-none">
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-3 max-w-lg"
                >
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-2xl shadow-purple-500/5 col-span-1">
                    <Globe size={26} className="text-purple-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-mono tracking-widest text-[#f5f3ff] uppercase flex items-center justify-center gap-1.5">
                      <Sparkles size={14} className="text-purple-400" /> Persistent Chromium Engine Active
                    </h3>
                    <p className="text-[10px] text-slate-500 font-mono tracking-wide mt-1 leading-normal max-w-sm mx-auto uppercase">
                      Direct Playwright Chromium browser navigation with continuous session persistence &amp; dynamic JS rendering!
                    </p>
                  </div>
                </motion.div>

                {/* Shortcuts Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 w-full max-w-2xl text-left">
                  {[
                    { name: "YouTube", desc: "Real YouTube videos, channels & media player", url: "https://youtube.com", icon: <Play size={13} />, color: "text-red-400 bg-red-950/10 border-red-500/20 hover:border-red-500/40" },
                    { name: "Google Search", desc: "Full Google search engine portal", url: "https://google.com", icon: <Search size={13} />, color: "text-blue-400 bg-blue-950/10 border-blue-500/20 hover:border-blue-500/40" },
                    { name: "GitHub", desc: "Repositories, code reviews, and developer dashboards", url: "https://github.com", icon: <Layers size={13} />, color: "text-purple-400 bg-purple-950/10 border-purple-500/20 hover:border-purple-500/40" },
                    { name: "Wikipedia", desc: "Articles and global knowledge pages", url: "https://wikipedia.org", icon: <BookOpen size={13} />, color: "text-emerald-400 bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40" },
                    { name: "ChatGPT Portal", desc: "Direct AI interface portal", url: "https://chatgpt.com", icon: <Sparkles size={13} />, color: "text-sky-400 bg-sky-950/15 border-sky-500/20 hover:border-sky-500/40" },
                    { name: "DuckDuckGo", desc: "Fast search indexes in Playwright window", url: "https://duckduckgo.com", icon: <Shield size={13} />, color: "text-orange-400 bg-orange-950/15 border-orange-500/20 hover:border-orange-500/40" }
                  ].map((shortcut, i) => (
                    <motion.div
                      key={shortcut.name}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigateToUrl(shortcut.url)}
                      className={`p-3.5 rounded-2xl border ${shortcut.color} hover:bg-white/5 cursor-pointer hover:shadow-lg transition duration-200 group flex flex-col justify-between h-24`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="p-1 rounded-lg bg-white/5 text-xs text-slate-300">{shortcut.icon}</span>
                        <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 text-slate-300 transition duration-200" />
                      </div>
                      <div>
                        <span className="text-xs font-bold font-mono tracking-wide text-slate-200">{shortcut.name}</span>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5 leading-normal max-w-[170px] truncate">{shortcut.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="p-3 border border-white/5 bg-slate-950/50 rounded-2xl max-w-md w-full">
                  <p className="text-[9px] font-mono text-slate-500 leading-normal uppercase">
                    🌸 COMPANION TIP: Ask Alya to open any site directly: <br />
                    <span className="text-indigo-400 font-bold">&ldquo;Open YouTube&rdquo; or &ldquo;Go to github.com&rdquo;</span>
                  </p>
                </div>

              </div>
            ) : diagnosticStatus === "error" ? (
              
              // DIAGNOSTIC ERROR CLASSIFICATION PORTAL
              <div className="flex-1 w-full h-full p-8 flex flex-col items-center justify-center bg-slate-950/80 text-center relative overflow-y-auto scrollbar-none">
                <div className="absolute inset-0 bg-radial-gradient from-rose-500/5 to-transparent pointer-events-none" />
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-xl p-8 rounded-3xl border border-rose-500/20 bg-slate-900/60 backdrop-blur-md space-y-6 shadow-[0_0_50px_rgba(244,63,94,0.06)]"
                >
                  <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center animate-pulse">
                    <AlertCircle size={22} className="text-rose-400" />
                  </div>
                  
                  <div className="space-y-2">
                    <span className="px-3 py-1 rounded-full bg-rose-950/40 border border-rose-500/30 text-[10px] font-mono font-extrabold uppercase tracking-[0.2em] text-rose-400 inline-block">
                      {diagnosticCategory || "BROWSER_NAVIGATION_ERROR"}
                    </span>
                    <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wide pt-1">
                      Browser Navigation Failure Diagnosed
                    </h3>
                    <p className="text-xs font-sans text-slate-400 leading-relaxed max-w-sm mx-auto font-medium">
                      Alya&apos;s Playwright browser engine encountered an error navigating to <span className="font-mono text-indigo-300 font-semibold">{getCleanTitleFromUrl(activeTab?.url || "")}</span>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-white/5 bg-slate-950/40 text-[10px] font-mono text-left space-y-1.5 text-slate-400 max-h-[150px] overflow-y-auto scrollbar-thin">
                    <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-slate-500 font-bold">TARGET URL:</span> <span className="text-slate-300 truncate max-w-[300px]">{activeTab?.url}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span className="text-slate-500 font-bold">CATEGORY:</span> <span className="text-rose-400 font-extrabold">{diagnosticCategory || "BROWSER_NAVIGATION_ERROR"}</span></div>
                    <div className="pt-1"><span className="text-slate-500 block mb-1 font-bold">FAILURE DETAILS:</span> <span className="text-rose-300 block leading-normal">{diagnosticReason || "Direct browser page load timed out or returned invalid response."}</span></div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
                    <button
                      onClick={() => handleRefresh()}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold font-mono transition duration-200 cursor-pointer flex items-center gap-1.5 justify-center shadow-lg shadow-purple-500/10"
                    >
                      <RefreshCw size={13} /> RETRY IN PLAYWRIGHT
                    </button>
                    <button
                      onClick={() => window.open(activeTab?.url, "_blank", "noopener,noreferrer")}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-mono transition cursor-pointer justify-center flex items-center gap-1.5"
                    >
                      <ExternalLink size={13} /> OPEN IN DESKTOP TAB
                    </button>
                    <button
                      onClick={() => navigateToUrl("about:blank")}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-mono transition cursor-pointer justify-center"
                    >
                      START PAGE
                    </button>
                  </div>
                </motion.div>
              </div>

            ) : activeTab?.url && activeTab.url.includes("youtube.com/results") ? (

              // REAL YOUTUBE SEARCH RESULTS VIEWER LAYER
              <div className="flex-1 w-full h-full bg-slate-950 flex flex-col overflow-hidden relative">
                <div className="px-6 py-4.5 border-b border-white/5 bg-slate-900/40 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <Play size={14} className="text-red-500" />
                    <span className="font-mono text-xs text-slate-200 font-bold uppercase tracking-wider">
                      Real-time YouTube Portal: &ldquo;{new URLSearchParams(activeTab.url.substring(activeTab.url.indexOf("?"))).get("search_query")}&rdquo;
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-400 uppercase font-extrabold tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Engine Connected
                  </span>
                </div>

                {ytSearchLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-3.5">
                    <div className="w-10 h-10 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-red-500 animate-pulse font-extrabold">Fetching Video Results...</span>
                  </div>
                ) : ytSearchError ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <AlertCircle size={24} className="text-red-400 animate-pulse" />
                    <p className="font-mono text-xs text-red-400 uppercase tracking-wider">Search Error</p>
                    <p className="font-sans text-[11px] text-slate-500 max-w-sm text-center leading-normal">{ytSearchError}</p>
                    <button 
                      onClick={handleRefresh}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-xs text-slate-300 transition"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 scrollbar-thin">
                    {ytSearchResults.map((video) => (
                      <motion.div
                        key={video.videoId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => navigateToUrl(`https://youtube.com/watch?v=${video.videoId}`)}
                        className="bg-slate-900/50 border border-white/5 hover:border-red-500/30 rounded-2xl overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300 group flex flex-col h-full"
                      >
                        <div className="relative aspect-video bg-black overflow-hidden">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                          <span className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded bg-black/85 font-mono text-[9px] text-slate-200 font-bold tracking-wide">
                            {video.duration}
                          </span>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                          <div className="space-y-1.5">
                            <h4 className="font-sans text-xs font-semibold text-slate-100 group-hover:text-red-400 transition line-clamp-2 leading-relaxed">
                              {video.title}
                            </h4>
                            <p className="font-mono text-[10px] text-slate-400 truncate tracking-wide">
                              {video.author}
                            </p>
                          </div>

                          <div className="flex items-center justify-between border-t border-white/5 pt-2.5 text-[9px] font-mono text-slate-500">
                            <span>{video.views}</span>
                            <span className="text-slate-600">•</span>
                            <span>{video.published || "Active Video"}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    
                    {ytSearchResults.length === 0 && (
                      <div className="col-span-full py-20 text-center space-y-2 font-mono text-slate-500 text-xs">
                        <Play size={20} className="mx-auto text-slate-600 mb-1" />
                        <div>No videos retrieved for this query.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            ) : viewMode === "playwright" ? (
              
              // REAL PLAYWRIGHT STREAM VIEWPORT WITH INTERACTIVE CLICK OVERLAY
              <div
                className="flex-1 w-full h-full relative overflow-hidden bg-[#07070a] flex items-center justify-center cursor-crosshair group select-none"
                onClick={handleViewportClick}
              >
                <img
                  src={`/api/browser/frame?tabId=${activeTabId}&ts=${frameTimestamp}`}
                  alt={activeTab?.title || "Playwright Browser Viewport"}
                  className="max-w-full max-h-full object-contain pointer-events-auto shadow-2xl"
                  onLoad={() => {
                    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t)));
                  }}
                  onError={() => {
                    // Frame loading fallback
                  }}
                />

                {/* Click Overlay Guidance Bar */}
                <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-black/80 border border-purple-500/30 backdrop-blur-md text-[10px] font-mono text-purple-300 pointer-events-none opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 shadow-lg">
                  <MousePointer size={12} className="text-purple-400 animate-bounce" />
                  <span>PLAYWRIGHT CHROMIUM STREAM — Click anywhere to interact directly</span>
                </div>

                {/* Secure Loading Indicator */}
                {activeTab?.isLoading && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
                    <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="font-mono text-[10px] text-purple-300 animate-pulse tracking-[0.25em] font-bold uppercase">
                      Navigating Direct Playwright Engine...
                    </span>
                  </div>
                )}
              </div>

            ) : (
              
              // DIRECT EMBED PORTAL FALLBACK VIEW
              <div className="flex-1 w-full h-full relative overflow-hidden">
                <iframe
                  src={activeTab?.url}
                  className="w-full h-full border-0 absolute inset-0 bg-[#07070a]"
                  allow="autoplay; encrypted-media; fullscreen"
                />
              </div>
            )}
          </div>

          {/* ENGINE LOGS CONSOLE SIDEBAR */}
          <AnimatePresence>
            {showLocalConsole && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="shrink-0 flex flex-col border-l border-white/5 bg-slate-950/70 backdrop-blur-md overflow-hidden relative"
              >
                <div className="p-5 flex-1 flex flex-col overflow-hidden space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                    <span className="font-mono text-xs uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1.5">
                      <Terminal size={14} /> Playwright Engine Logs
                    </span>
                    <button
                      onClick={() => setShowLocalConsole(false)}
                      className="text-slate-500 hover:text-white transition cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-2 pr-1 select-text scrollbar-thin">
                    {localLogs.length === 0 ? (
                      <div className="text-slate-600 italic">No browser logs recorded yet.</div>
                    ) : (
                      localLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`p-2 rounded-lg border leading-normal ${
                            log.type === "success"
                              ? "text-emerald-400 bg-emerald-950/10 border-emerald-500/10"
                              : log.type === "error"
                              ? "text-rose-400 bg-rose-950/10 border-rose-500/10"
                              : log.type === "action"
                              ? "text-purple-300 bg-purple-950/20 border-purple-500/20 font-semibold"
                              : "text-slate-400 bg-white/5 border-transparent"
                          }`}
                        >
                          {log.text}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-white/5 text-[9px] font-mono text-slate-500 text-center uppercase tracking-widest">
                    PLAYWRIGHT RUNTIME • ACTIVE
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* 4. DEVELOPER DIAGNOSTICS & DEBUG PANEL */}
        <AnimatePresence>
          {showDebugPanel && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="relative z-20 border-t border-white/10 bg-slate-950/90 text-left backdrop-blur-xl shrink-0"
            >
              <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 font-mono text-[10px] tracking-wide text-slate-400 leading-normal max-h-48 overflow-y-auto select-text scrollbar-thin">
                
                {/* Panel header */}
                <div className="md:col-span-4 flex items-center justify-between border-b border-white/5 pb-1.5 mb-1 text-[11px] font-extrabold uppercase text-amber-400">
                  <div className="flex items-center gap-1.5">
                    <Terminal size={13} className="animate-pulse" />
                    <span>Alya Persistent Playwright Browser Diagnostics</span>
                  </div>
                  <span className="text-[9px] text-slate-500 hover:text-slate-300 cursor-pointer" onClick={() => setShowDebugPanel(false)}>
                    Collapse [x]
                  </span>
                </div>

                {/* Metric 1: Navigation Status */}
                <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/5">
                  <p className="text-slate-500 font-bold uppercase select-none">ENGINE METRICS</p>
                  <div>
                    <span className="text-slate-600">Active URL:</span>{" "}
                    <span className="text-indigo-400 select-all font-semibold truncate max-w-[120px] inline-block align-bottom">{activeTab?.url || "about:blank"}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Engine Status:</span>{" "}
                    <span className={`font-semibold ${
                      diagnosticStatus === "secure" ? "text-emerald-400" :
                      diagnosticStatus === "error" ? "text-rose-400" : "text-amber-400"
                    }`}>
                      {diagnosticStatus.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600">Playwright Runtime:</span>{" "}
                    <span className="text-emerald-400 font-bold">{isLocalConnected ? "ONLINE (CONNECTED)" : "INITIALIZING"}</span>
                  </div>
                </div>

                {/* Metric 2: Load Stats */}
                <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/5">
                  <p className="text-slate-500 font-bold uppercase select-none">TIMING &amp; FREQUENCY</p>
                  <div>
                    <span className="text-slate-600">Navigation Time:</span>{" "}
                    <span className="text-purple-400">{loadTimeMs}ms</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Successful Loads:</span>{" "}
                    <span className="text-slate-300">{iframeOnLoadCount} triggers</span>
                  </div>
                  <div>
                    <span className="text-slate-600">View Mode:</span>{" "}
                    <span className="text-indigo-300 font-bold">{viewMode.toUpperCase()}</span>
                  </div>
                </div>

                {/* Metric 3: Error Classification */}
                <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/5 md:col-span-1">
                  <p className="text-slate-500 font-bold uppercase select-none">ERROR CATEGORY</p>
                  <p className="text-slate-600 leading-tight">
                    {diagnosticCategory ? (
                      <span className="text-rose-400 font-bold block">
                        [{diagnosticCategory}]
                      </span>
                    ) : (
                      <span className="text-emerald-500 font-bold block">
                        NO ACTIVE ERRORS
                      </span>
                    )}
                    {diagnosticReason && (
                      <span className="text-slate-400 block text-[9px] mt-1 leading-normal truncate max-w-[200px]">
                        {diagnosticReason}
                      </span>
                    )}
                  </p>
                </div>

                {/* Metric 4: Diagnostic Trace */}
                <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/5 md:col-span-1">
                  <p className="text-slate-500 font-bold uppercase select-none">RECENT ENGINE EVENTS</p>
                  <div className="max-h-16 overflow-y-auto scrollbar-thin text-[9px] text-slate-400 leading-tight">
                    {localLogs.slice(-3).map((l) => (
                      <div key={l.id} className="truncate border-b border-white/5 pb-0.5">
                        {l.text}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};
