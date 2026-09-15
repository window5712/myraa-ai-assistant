import { useState, useEffect, useRef } from "react";
import { MyraaAudioSession, LiveState } from "./lib/audio";
import { MyraaCoreVisualizer, MyraaEmotion } from "./components/MyraaCoreVisualizer";
import { BrowserAgent } from "./components/BrowserAgent";
import {
  Power,
  Volume2,
  Info,
  Sparkles,
  Globe,
  Maximize2,
  MessageSquareOff,
  Compass,
  CircleAlert,
  MicOff,
  Mic,
  X,
  Brain,
  Monitor,
  Play,
  Pause,
  Square,
  RefreshCw,
  Minus,
  Pin,
  PinOff,
  Calendar,
  Bell,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Memory, MemoryCategory, LifeMemoryDB, Reminder } from "./lib/memoryTypes";
import { MemoryDashboard } from "./components/MemoryDashboard";
import { LifeMemoryDashboard } from "./components/LifeMemoryDashboard";
import { AgentActivityPanel, AgentActivity } from "./components/AgentActivityPanel";
import { DesktopDiagnosticsPanel } from "./components/DesktopDiagnosticsPanel";
import { Activity } from "lucide-react";
import { ComposioConnectModal } from "./components/ComposioConnectModal";
import { AnimationControlPanel } from "./components/AnimationControlPanel";
import { AnimationSettings, DEFAULT_ANIMATION_SETTINGS } from "./lib/alyaVideoConfig";

const EMPTY_LIFE_DB: LifeMemoryDB = {
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

// Electron bridge (only present in the desktop shell; web build is unaffected).
interface ElectronWindowAPI {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  togglePin: () => void;
  onMaximizedChange: (cb: (isMaximized: boolean) => void) => () => void;
}
declare global {
  interface Window {
    electronAPI?: ElectronWindowAPI;
  }
}
const isElectron = typeof window !== "undefined" && !!window.electronAPI;

export default function App() {
  const [state, setState] = useState<LiveState>("disconnected");

  // Real-time Screen Sharing states
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isScreenSharingPaused, setIsScreenSharingPaused] = useState<boolean>(false);
  const [screenVisionMode, setScreenVisionMode] = useState<boolean>(true);

  // References to preserve state across intervals
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<any>(null);

  const isPausedRef = useRef<boolean>(false);
  const screenVisionRef = useRef<boolean>(true);
  const stateRef = useRef<LiveState>("disconnected");

  // Sync state changes with refs to totally prevent stale closures in callbacks
  useEffect(() => {
    isPausedRef.current = isScreenSharingPaused;
  }, [isScreenSharingPaused]);

  useEffect(() => {
    screenVisionRef.current = screenVisionMode;
  }, [screenVisionMode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clean up streaming intervals on unmount
  useEffect(() => {
    return () => {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
    };
  }, []);

  const captureFrameAndSend = () => {
    const video = screenVideoRef.current;
    if (!video || isPausedRef.current || !screenVisionRef.current) {
      return;
    }

    if (stateRef.current === "disconnected") {
      return;
    }

    try {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement("canvas");
      }
      const canvas = screenCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Restrict maximum resolution size to keep payload light for Gemini Live
      const maxDim = 960;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(video, 0, 0, width, height);

      // Highly compressed JPEG standard is optimized and preserves details perfectly
      const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
      const base64 = dataUrl.split(",")[1];

      if (sessionRef.current && stateRef.current !== "disconnected") {
        sessionRef.current.sendVideoFrame(base64);
      }
    } catch (err) {
      console.error("[Screen Capture] Failed drawing frame to canvas:", err);
    }
  };

  const startScreenSharing = async () => {
    setErrorText(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 5 }
        },
        audio: false
      });

      screenStreamRef.current = stream;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(e => console.error("Video play warning:", e));
      screenVideoRef.current = video;

      setIsScreenSharing(true);
      setIsScreenSharingPaused(false);

      // Stop handling when native stop sharing bar button ends
      stream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };

      // Set up frame capture interval (one frame every 2 seconds is highly robust, preventing overload)
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
      screenIntervalRef.current = setInterval(() => {
        captureFrameAndSend();
      }, 2000);

      // Promptly capture first frame immediately
      setTimeout(() => {
        captureFrameAndSend();
      }, 500);

    } catch (e: any) {
      console.error("Screen sharing permission declined or missing API:", e);
      if (e.name !== "NotAllowedError") {
        setErrorText(`Could not capture screen: ${e.message || e}`);
      }
    }
  };

  const stopScreenSharing = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) { }
      });
      screenStreamRef.current = null;
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.pause();
      screenVideoRef.current = null;
    }

    setIsScreenSharing(false);
    setIsScreenSharingPaused(false);
  };

  const pauseScreenSharing = () => {
    setIsScreenSharingPaused(true);
  };

  const resumeScreenSharing = () => {
    setIsScreenSharingPaused(false);
    // Refresh first frame immediately
    setTimeout(() => {
      captureFrameAndSend();
    }, 100);
  };

  const switchScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) { }
      });
    }
    await startScreenSharing();
  };

  const [activeEmotion, setActiveEmotion] = useState<MyraaEmotion>("idle");
  const [themeColor, setThemeColor] = useState<string>("charcoal");
  const [userCaption, setUserCaption] = useState<string>("");
  const [characterState, setCharacterState] = useState<"idle" | "thinking" | "talking">("idle");
  // Track whether we've shown greeting on this session (prevent repeat greetings)
  const sessionGreetedRef = useRef<boolean>(false);

  // Desktop window state (Electron only)
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(false);

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    const unsub = window.electronAPI.onMaximizedChange((max) => setIsMaximized(max));
    return unsub;
  }, []);

  const detectEmotionFromText = (text: string): MyraaEmotion => {
    if (!text || !text.trim()) return "idle";
    const lower = text.toLowerCase();

    // 1. Emojis matching
    if (/[\u{1F923}\u{1F602}\u{1F606}]/u.test(text)) return "laughing";
    if (/[\u{1F601}\u{1F603}\u{1F604}\u{1F60A}\u{1F973}\u{1F389}\u{1F38A}\u{2728}]/u.test(text)) return "happy";
    if (/[\u{1F622}\u{1F62D}\u{2639}\u{1F641}\u{1F494}\u{1F614}\u{1F615}\u{1F97A}]/u.test(text)) return "sad";
    if (/[\u{1F914}\u{1F9D0}\u{1F4A1}\u{1F50D}\u{1F9E0}]/u.test(text)) return "thinking";
    if (/[\u{1F929}\u{1F680}\u{26A1}\u{1F525}\u{1F92F}]/u.test(text)) return "excited";
    if (/[\u{1F632}\u{1F631}\u{1F62E}]/u.test(text)) return "surprised";
    if (/[\u{1F633}\u{1F648}\u{1F649}\u{1F64A}]/u.test(text)) return "shy";
    if (/[\u{1F609}\u{1F91C}\u{1F91D}]/u.test(text)) return "playful";
    if (/[\u{2705}\u{1F3AF}\u{1F44D}\u{1F44F}\u{1F3C6}]/u.test(text)) return "satisfied";
    if (/[\u{1F621}\u{1F624}\u{1F92C}]/u.test(text)) return "angry";
    if (/[\u{1F915}\u{1F919}\u{1F60C}]/u.test(text)) return "calm";

    // 2. Laughing / Hilarious
    if (
      lower.includes("haha") ||
      lower.includes("lol") ||
      lower.includes("lmao") ||
      lower.includes("rofl") ||
      lower.includes("hehe") ||
      lower.includes("hilarious") ||
      lower.includes("cracking up") ||
      lower.includes("died laughing") ||
      lower.includes("giggle")
    ) return "laughing";

    // 3. Playful / Winking / Teasing
    if (
      lower.includes("funny") ||
      lower.includes("joke") ||
      lower.includes("wink") ||
      lower.includes("tease") ||
      lower.includes("playful") ||
      lower.includes("kidding") ||
      lower.includes("just kidding")
    ) return "playful";

    // 4. Excited / Hype
    if (
      lower.includes("wow") ||
      lower.includes("awesome") ||
      lower.includes("excited") ||
      lower.includes("amazing") ||
      lower.includes("yay") ||
      lower.includes("incredible") ||
      lower.includes("hype") ||
      lower.includes("thrilled") ||
      lower.includes("pumped") ||
      lower.includes("unbelievable") ||
      lower.includes("let's go") ||
      lower.includes("lets go")
    ) return "excited";

    // 5. Happy / Smile / Joy
    if (
      lower.includes("happy") ||
      lower.includes("harmony") ||
      lower.includes("glad") ||
      lower.includes("joy") ||
      lower.includes("wonderful") ||
      lower.includes("delighted") ||
      lower.includes("love") ||
      lower.includes("smile") ||
      lower.includes("smiling") ||
      lower.includes("great") ||
      lower.includes("fantastic") ||
      lower.includes("super") ||
      lower.includes("brilliant") ||
      lower.includes("sweet") ||
      lower.includes("nice") ||
      lower.includes("pleasant") ||
      lower.includes("cheers")
    ) return "happy";

    // 6. Sad / Depressed / Grief / Bad Day / Upset
    if (
      lower.includes("sad") ||
      lower.includes("sorry") ||
      lower.includes("unfortunate") ||
      lower.includes("grief") ||
      lower.includes("depressed") ||
      lower.includes("feeling down") ||
      lower.includes("bad day") ||
      lower.includes("heartbroken") ||
      lower.includes("disappointed") ||
      lower.includes("alas") ||
      lower.includes("crying") ||
      lower.includes("tears") ||
      lower.includes("unhappy") ||
      lower.includes("gloomy") ||
      lower.includes("tragedy") ||
      lower.includes("terrible") ||
      lower.includes("awful") ||
      lower.includes("miserable") ||
      lower.includes("painful") ||
      lower.includes("hurt") ||
      lower.includes("lonely") ||
      lower.includes("loss") ||
      lower.includes("miss you") ||
      lower.includes("upset")
    ) return "sad";

    // 7. Satisfied / Accomplished / Success
    if (
      lower.includes("done") ||
      lower.includes("finished") ||
      lower.includes("completed") ||
      lower.includes("success") ||
      lower.includes("accomplished") ||
      lower.includes("all set") ||
      lower.includes("sorted") ||
      lower.includes("nailed it") ||
      lower.includes("perfect") ||
      lower.includes("solved") ||
      lower.includes("resolved")
    ) return "satisfied";

    // 8. Proud / Achievement
    if (
      lower.includes("proud") ||
      lower.includes("achieved") ||
      lower.includes("achievement") ||
      lower.includes("expert") ||
      lower.includes("skill") ||
      lower.includes("confidence") ||
      lower.includes("succeed") ||
      lower.includes("champion")
    ) return "proud";

    // 9. Calm / Relaxed / Peaceful
    if (
      lower.includes("relax") ||
      lower.includes("calm") ||
      lower.includes("peaceful") ||
      lower.includes("no worries") ||
      lower.includes("it's okay") ||
      lower.includes("its okay") ||
      lower.includes("take it easy") ||
      lower.includes("breathe") ||
      lower.includes("serene") ||
      lower.includes("tranquil") ||
      lower.includes("chill")
    ) return "calm";

    // 10. Thinking / Processing / Deep Analysis
    if (
      lower.includes("think") ||
      lower.includes("thinking") ||
      lower.includes("calculat") ||
      lower.includes("analyz") ||
      lower.includes("hmmm") ||
      lower.includes("let me see") ||
      lower.includes("let's see") ||
      lower.includes("figure out") ||
      lower.includes("conclude") ||
      lower.includes("checking") ||
      lower.includes("searching") ||
      lower.includes("working") ||
      lower.includes("solving") ||
      lower.includes("evaluating") ||
      lower.includes("pondering") ||
      lower.includes("brainstorming") ||
      lower.includes("querying") ||
      lower.includes("investigating")
    ) return "thinking";

    // 11. Processing (deep code / system actions)
    if (
      lower.includes("process") ||
      lower.includes("computing") ||
      lower.includes("running") ||
      lower.includes("executing") ||
      lower.includes("compiling") ||
      lower.includes("fetching")
    ) return "processing";

    // 12. Curious / Inquisitive
    if (
      lower.includes("curious") ||
      lower.includes("wonder") ||
      lower.includes("interest") ||
      lower.includes("tell me more") ||
      lower.includes("fascinating") ||
      lower.includes("explore") ||
      lower.includes("discover") ||
      lower.includes("really?") ||
      lower.includes("connecting") ||
      lower.includes("accessing")
    ) return "curious";

    // 13. Surprised / Shocked
    if (
      lower.includes("shock") ||
      lower.includes("surprise") ||
      lower.includes("surprised") ||
      lower.includes("gasp") ||
      lower.includes("unexpected") ||
      lower.includes("seriously") ||
      lower.includes("oh my") ||
      lower.includes("no way") ||
      lower.includes("omg") ||
      lower.includes("whoa")
    ) return "surprised";

    // 14. Shy / Embarrassed / Nervous
    if (
      lower.includes("blush") ||
      lower.includes("shy") ||
      lower.includes("embarrass") ||
      lower.includes("nervous") ||
      lower.includes("oops") ||
      lower.includes("sorry about") ||
      lower.includes("my bad") ||
      lower.includes("failed") ||
      lower.includes("error") ||
      lower.includes("flustered")
    ) return "embarrassed";

    // 15. Angry / Mad / Furious
    if (
      lower.includes("angry") ||
      lower.includes("anger") ||
      lower.includes("mad") ||
      lower.includes("furious") ||
      lower.includes("frustrat") ||
      lower.includes("annoy") ||
      lower.includes("rage") ||
      lower.includes("hate") ||
      lower.includes("irritat")
    ) return "angry";

    // 16. Confused / Puzzled
    if (
      lower.includes("what?") ||
      lower.includes("confus") ||
      lower.includes("puzzled") ||
      lower.includes("dont know") ||
      lower.includes("don't know") ||
      lower.includes("not sure") ||
      lower.includes("baffled") ||
      lower.includes("unclear") ||
      lower.includes("wait")
    ) return "confused";

    // 17. Question indicators -> curious
    if (lower.includes("why") || lower.includes("how") || lower.includes("what if")) return "curious";

    // 18. Greetings / Farewells
    if (lower.includes("hello") || lower.includes("hi ") || lower.startsWith("hi") || lower.includes("hey") || lower.includes("greetings")) return "greeting";
    if (lower.includes("goodbye") || lower.includes("bye") || lower.includes("farewell") || lower.includes("see ya")) return "farewell";

    return "idle";
  };
  const [modelCaption, setModelCaption] = useState<string>("");
  const [activeProjectorUrl, setActiveProjectorUrl] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Agent activity & Composio confirmation state
  const [agentActivity, setAgentActivity] = useState<AgentActivity>({ status: "idle" });
  const [composioConfirmation, setComposioConfirmation] = useState<{
    callId: string;
    action: string;
    params: any;
    confirmationMessage: string;
  } | null>(null);

  // Alya Autopilot system controller state
  const [browserTrigger, setBrowserTrigger] = useState<{
    type: string;
    args: any;
    id: string;
    callback: (res: any) => void;
  } | null>(null);

  // Composio App Manager state
  const [showComposioManager, setShowComposioManager] = useState<boolean>(false);

  // Alya recollections database core state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemoryDashboard, setShowMemoryDashboard] = useState<boolean>(false);

  // Animation video stage customization settings state
  const [animationSettings, setAnimationSettings] = useState<AnimationSettings>(DEFAULT_ANIMATION_SETTINGS);
  const [showAnimationPanel, setShowAnimationPanel] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);

  // Life Memory System state
  const [lifeDB, setLifeDB] = useState<LifeMemoryDB>(EMPTY_LIFE_DB);
  const [showLifeDashboard, setShowLifeDashboard] = useState<boolean>(false);
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);

  // Proactive conversation engine state
  const [proactiveState, setProactiveState] = useState<string>("ACTIVE_CONVERSATION");
  const [lastProactiveQuestion, setLastProactiveQuestion] = useState<string>("");
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState<boolean>(false);

  // Electron native tray listeners
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const api = (window as any).electronAPI;
      if (api.onOpenDiagnostics) {
        api.onOpenDiagnostics(() => setShowDiagnosticsPanel(true));
      }
      if (api.onToggleProactive) {
        api.onToggleProactive((isPaused: boolean) => {
          setProactiveState(isPaused ? "STOPPED" : "ACTIVE_CONVERSATION");
        });
      }
    }
  }, []);

  const fetchLifeDB = async () => {
    try {
      const res = await fetch("/api/life/db");
      const data = await res.json();
      if (data && Array.isArray(data.projects)) {
        setLifeDB(data);
      }
    } catch (err) {
      console.error("Life DB fetch error:", err);
    }
  };

  // Hotkey listener for stage fullscreen (F key) & native fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in text input fields
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === "f" || e.key === "F") {
        setAnimationSettings((prev) => ({
          ...prev,
          isStageFullscreen: !prev.isStageFullscreen,
        }));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleToggleNativeFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsNativeFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsNativeFullscreen(false);
    }
  };

  const sessionRef = useRef<MyraaAudioSession | null>(null);

  // Fetch initial recollections from backend database
  useEffect(() => {
    fetch("/api/memories")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMemories(data);
        }
      })
      .catch(err => console.error("Initial persistent recollections load failure:", err));

    // Also fetch life memory DB on mount
    fetchLifeDB();
  }, []);

  const handleAddManualMemory = async (category: MemoryCategory, text: string) => {
    try {
      const resp = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text })
      });
      const saved = await resp.json();
      if (saved && saved.id) {
        setMemories((prev) => [...prev, saved]);
      }
    } catch (err) {
      console.error("Manual database recollect upload error:", err);
    }
  };

  const handleUpdateMemory = async (id: string, category: MemoryCategory, text: string) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text })
      });
      const updated = await resp.json();
      if (updated && updated.id) {
        setMemories((prev) => prev.map(m => m.id === id ? updated : m));
      }
    } catch (err) {
      console.error("Manual memory update failed:", err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, {
        method: "DELETE"
      });
      const data = await resp.json();
      if (data && data.success) {
        setMemories((prev) => prev.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error("Manual memory delete failed:", err);
    }
  };

  const handleExtractMemories = async (sampleText?: string) => {
    try {
      const resp = await fetch("/api/memories/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleText })
      });
      const data = await resp.json();
      if (Array.isArray(data)) {
        setMemories(data);
      }
    } catch (err) {
      console.error("Auto memory extraction failed:", err);
    }
  };

  // Initialize the audio session handlers once on mount
  useEffect(() => {
    sessionRef.current = new MyraaAudioSession({
      onStateChange: (newState) => {
        setState(newState);
        if (newState === "disconnected") {
          // Reset captions on disconnect
          setUserCaption("");
          setModelCaption("");
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "listening") {
          // Return to receptive resting state
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "speaking") {
          setCharacterState("talking");
        }
      },
      onTranscription: (role, text) => {
        if (role === "user") {
          setUserCaption(text);
          // Auto-clear the other caption when user starts talking
          setModelCaption("");
          setCharacterState("thinking");
          // Auto-pick animation based on user's spoken emotion/sentiment
          const userEmotion = detectEmotionFromText(text);
          if (userEmotion !== "idle") {
            setActiveEmotion(userEmotion);
          } else if (
            text.includes("?") ||
            text.toLowerCase().includes("how") ||
            text.toLowerCase().includes("why") ||
            text.toLowerCase().includes("what")
          ) {
            setActiveEmotion("thinking");
          }
        } else if (role === "model") {
          setModelCaption((prev) => {
            const next = prev + text;
            const newEmotion = detectEmotionFromText(next);
            if (newEmotion !== "idle") {
              setActiveEmotion(newEmotion);
            }
            return next;
          });
          // Clear user caption when model replies
          setUserCaption("");
        }
      },
      onToolCall: (name, args, callback) => {
        console.log(`[App] Tool call triggered: ${name}`, args);

        const browserTools = [
          "browserOpen",
          "browserSearch",
          "browserClick",
          "browserMediaControl",
          "browserScroll",
          "browserType",
          "browserGoBack",
          "browserTabAction",
          "openWebsite"
        ];

        if (browserTools.includes(name)) {
          let startingUrl = "https://www.youtube.com";
          if ((name === "browserOpen" || name === "openWebsite") && args.url) {
            startingUrl = args.url;
          }

          if (!activeProjectorUrl) {
            setActiveProjectorUrl(startingUrl);
          }

          // Map instructions to Browser Agent HUD or execute via backend API directly
          setBrowserTrigger({
            type: name === "openWebsite" ? "browserOpen" : name,
            args,
            id: Math.random().toString(),
            callback: (res) => {
              callback(res);
              setBrowserTrigger(null);
            }
          });

          // Also execute against backend Playwright engine directly to ensure action succeeds
          const apiType = name === "openWebsite" ? "browserOpen" : name;
          if (apiType === "browserOpen") {
            fetch("/api/browser/navigate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: args.url || startingUrl }),
            }).catch(() => {});
          } else {
            fetch("/api/browser/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: apiType, args }),
            }).catch(() => {});
          }
        } else if (name === "changeBackground") {
          const colorName = args.color?.toLowerCase();
          const validColors = ["violet", "crimson", "emerald", "celestial", "gold", "rose", "charcoal"];

          if (colorName && validColors.includes(colorName)) {
            setThemeColor(colorName);
            callback({ result: `Successfully shifted aesthetic atmosphere to ${colorName}.` });
          } else {
            callback({ error: `Unsupported color '${colorName}'. Supported themes are: ${validColors.join(", ")}` });
          }
        } else {
          callback({ error: `Tool ${name} is not implemented.` });
        }
      },
      onError: (err) => {
        setErrorText(err);
      },
      onMemorySync: (updatedMemories) => {
        console.log("[App] WebSocket memories sync triggered:", updatedMemories);
        if (Array.isArray(updatedMemories)) {
          setMemories(updatedMemories);
        }
      },
      onAgentActivity: (activity) => {
        setAgentActivity(activity);
        if (activity.status === "thinking") {
          setActiveEmotion("thinking");
          setCharacterState("thinking");
        } else if (activity.status === "success") {
          // Use satisfied (polished success reaction clip)
          setActiveEmotion("satisfied");
          setCharacterState("idle");
          // Auto-return to calm after 3 seconds
          setTimeout(() => {
            setActiveEmotion("calm");
          }, 3000);
        } else if (activity.status === "error") {
          setActiveEmotion("confused");
          setCharacterState("idle");
        } else if (activity.status === "idle") {
          setActiveEmotion("calm");
          setCharacterState("idle");
        }
      },
      onComposioConfirmation: (data) => {
        setComposioConfirmation(data);
      },
      onComposioConnectRequired: (data) => {
        console.log("[App] Composio connect required event received:", data);
        if (data.redirectUrl) {
          try {
            window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
          } catch (e) {
            console.error("Window open error:", e);
          }
        }
        setAgentActivity({
          status: "error",
          action: data.action,
          summary: `Connection required for ${data.appName.toUpperCase()}. Chrome sign-in tab opened!`,
          redirectUrl: data.redirectUrl,
          appName: data.appName
        });
      },
      onLifeMemorySync: (db: LifeMemoryDB) => {
        setLifeDB(db);
      },
      onReminderTriggered: (reminder: Reminder) => {
        setActiveReminder(reminder);
        // Auto-dismiss after 10 seconds
        setTimeout(() => setActiveReminder(null), 10000);
      },
      onProactiveStateChange: (state: string) => {
        setProactiveState(state);
        if (state === "SILENT") {
          setActiveEmotion("sad");
          setCharacterState("idle");
        } else if (state === "ACTIVE_CONVERSATION") {
          setActiveEmotion("idle");
        }
      },
      onProactiveQuestionSent: (question: string) => {
        setLastProactiveQuestion(question);
        // Auto-clear the proactive question preview after 30s
        setTimeout(() => setLastProactiveQuestion(""), 30000);
      },
    });

    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, []);

  const handleToggleConnection = async () => {
    setErrorText(null);
    if (!sessionRef.current) return;

    if (state === "disconnected") {
      await sessionRef.current.connect();
    } else {
      sessionRef.current.disconnect();
    }
  };

  const handleConfirmAction = (confirmed: boolean, callId: string) => {
    if (composioConfirmation && sessionRef.current) {
      sessionRef.current.sendConfirmationResponse(
        callId,
        composioConfirmation.action,
        composioConfirmation.params,
        confirmed
      );
    }
    setComposioConfirmation(null);
  };

  const handleCancelTask = (planId?: string) => {
    fetch("/api/agent/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    }).catch(() => {});
    setAgentActivity({ status: "idle", summary: "Task canceled by user" });
  };

  const handleRetryTask = (action: string, params?: any) => {
    if (!action) return;
    setAgentActivity({ status: "executing", action, summary: `Retrying ${action}...` });
    fetch("/api/composio/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params: params || {} }),
    })
      .then((res) => res.json())
      .then((res) => {
        setAgentActivity({
          status: res.success ? "success" : "error",
          action,
          summary: res.success ? `Executed ${action} successfully` : `Retry failed: ${res.error}`,
        });
      })
      .catch((err) => {
        setAgentActivity({ status: "error", action, summary: `Retry failed: ${err.message}` });
      });
  };

  // Maps theme colors to CSS ambient light spots
  const getAmbientStyles = () => {
    switch (themeColor) {
      case "violet":
        return "from-purple-950/40 via-violet-950/20 to-slate-950";
      case "crimson":
        return "from-red-950/40 via-orange-950/20 to-slate-950";
      case "emerald":
        return "from-emerald-950/40 via-teal-950/20 to-slate-950";
      case "celestial":
        return "from-sky-950/45 via-indigo-950/25 to-slate-950";
      case "gold":
        return "from-amber-950/30 via-yellow-950/15 to-slate-950";
      case "rose":
        return "from-rose-950/40 via-pink-950/20 to-slate-950";
      case "charcoal":
      default:
        return "from-slate-900/50 via-slate-950/30 to-slate-950";
    }
  };

  const getThemeTextGlow = () => {
    switch (themeColor) {
      case "violet": return "text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]";
      case "crimson": return "text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "emerald": return "text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]";
      case "celestial": return "text-sky-400 drop-shadow-[0_0_12px_rgba(14,165,233,0.5)]";
      case "gold": return "text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]";
      case "rose": return "text-pink-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "charcoal":
      default:
        return "text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]";
    }
  };

  const getOrbRingColor = () => {
    switch (state) {
      case "listening": return "border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.3)] bg-indigo-500/10";
      case "speaking": return "border-purple-500/70 shadow-[0_0_40px_rgba(168,85,247,0.4)] bg-purple-500/10";
      case "connecting": return "border-amber-500/50 animate-pulse bg-amber-500/10";
      case "disconnected":
      default:
        return "border-white/10 hover:border-indigo-500/30 bg-white/5";
    }
  };

  return (
    <div
      id="alya-holographic-desktop"
      className={`relative w-full h-screen overflow-hidden bg-[#020205] text-white ${getAmbientStyles()} theme-transition flex flex-col justify-between p-6 sm:p-10 select-none`}
    >
      {/* Ambient Background Gradients matching Frosted Glass theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-900/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-900/15 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-indigo-800/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Decorative grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40" />

      {/* FULL VIEWPORT HOLOGRAPHIC STAGE: Alya materializes across the entire screen */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        <MyraaCoreVisualizer
          session={sessionRef.current}
          state={state}
          themeColor={themeColor}
          activeEmotion={activeEmotion}
          characterState={characterState}
          animationSettings={animationSettings}
        />
      </div>

      {/* HEADER SECTION - Minimalist typography (draggable in desktop shell) */}
      <header
        className="relative z-30 flex items-center justify-between w-full max-w-5xl mx-auto select-none"
        style={isElectron ? { WebkitAppRegion: "drag" } as any : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-[0.4em] text-white/50 uppercase font-sans">
            Alya
          </span>
          <div className={`w-1.5 h-1.5 rounded-full ${state === "listening" || state === "speaking"
              ? "bg-cyan-400"
              : "bg-white/10"
            }`} />
        </div>

        <div
          className="flex items-center gap-5"
          style={isElectron ? { WebkitAppRegion: "no-drag" } as any : undefined}
        >
          {/* Faint utilities hidden in margin */}
          <button
            onClick={() => setShowAnimationPanel(true)}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${
              animationSettings.isStageFullscreen
                ? "text-purple-300 opacity-100 font-bold drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                : "opacity-35 hover:opacity-100 text-white hover:text-purple-300"
            }`}
            title="Animation Video Stage & Customization (Press F for full screen)"
          >
            <Sparkles size={14} className={animationSettings.isStageFullscreen ? "animate-pulse text-purple-400" : ""} />
            <span className="hidden sm:inline">STAGE &amp; ANIMATION</span>
          </button>

          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Sway Themes and Info"
          >
            <Compass size={14} />
            <span className="hidden sm:inline">TOPICS</span>
          </button>

          <button
            onClick={() => setShowMemoryDashboard(!showMemoryDashboard)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Recollections Database"
          >
            <Brain size={14} />
            <span className="hidden sm:inline">RECALLS</span>
          </button>

          <button
            onClick={() => setShowLifeDashboard(!showLifeDashboard)}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${
              showLifeDashboard
                ? "text-indigo-300 opacity-100 font-semibold"
                : "opacity-25 hover:opacity-100 text-white hover:text-indigo-300"
            }`}
            title="Life OS — Projects, Tasks, Reminders, Goals, Calendar"
          >
            <Calendar size={14} />
            <span className="hidden sm:inline">LIFE OS</span>
            {(lifeDB.reminders.filter(r => r.status === "scheduled" && new Date(r.dueAt) <= new Date()).length > 0 ||
              lifeDB.tasks.filter(t => t.requiredComposioApp && !t.composioAppConnected).length > 0) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setShowComposioManager(true)}
            className="flex items-center gap-1.5 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer hover:text-teal-300"
            title="Connect Apps via Composio"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span className="hidden sm:inline">CONNECT APPS</span>
          </button>

          <button
            onClick={() => setShowDiagnosticsPanel(true)}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${
              showDiagnosticsPanel ? "text-indigo-300 opacity-100 font-semibold" : "opacity-25 hover:opacity-100 text-white hover:text-indigo-300"
            }`}
            title="Desktop Diagnostics & Health Controls"
          >
            <Activity size={14} />
            <span className="hidden sm:inline">DIAGNOSTICS</span>
          </button>

          {/* Proactive conversation engine status indicator */}
          {state !== "disconnected" && (
            <div
              className={`flex items-center gap-1 text-[10px] font-mono tracking-widest transition-all ${
                proactiveState === "STOPPED"
                  ? "text-rose-400 opacity-80"
                  : proactiveState === "SILENT"
                  ? "text-amber-400 opacity-70"
                  : proactiveState === "THINKING" || proactiveState === "PROACTIVE_QUESTION"
                  ? "text-cyan-400 opacity-90"
                  : "text-white/20 opacity-50"
              }`}
              title={
                proactiveState === "STOPPED"
                  ? "Proactive mode stopped (say 'resume' to restart)"
                  : proactiveState === "SILENT"
                  ? "Proactive mode silenced (user not responding)"
                  : proactiveState === "THINKING"
                  ? "Generating proactive question..."
                  : proactiveState === "PROACTIVE_QUESTION"
                  ? `Proactive: "${lastProactiveQuestion}"`
                  : "Proactive conversation active"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  proactiveState === "STOPPED"
                    ? "bg-rose-500"
                    : proactiveState === "SILENT"
                    ? "bg-amber-400"
                    : proactiveState === "THINKING" || proactiveState === "PROACTIVE_QUESTION"
                    ? "bg-cyan-400 animate-pulse"
                    : "bg-white/20"
                }`}
              />
              <span className="hidden sm:inline">
                {proactiveState === "STOPPED"
                  ? "PROACTIVE STOPPED"
                  : proactiveState === "SILENT"
                  ? "PROACTIVE SILENT"
                  : proactiveState === "THINKING"
                  ? "THINKING..."
                  : proactiveState === "PROACTIVE_QUESTION"
                  ? "ASKED"
                  : ""}
              </span>
            </div>
          )}

          {/* Real-time screen sharing toggler button inside Alya glass style header */}
          <button
            onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${isScreenSharing
                ? "text-cyan-400 opacity-100 font-semibold"
                : "opacity-25 hover:opacity-100 text-white"
              }`}
            title="Share Screen with Alya"
          >
            <Monitor size={14} className={isScreenSharing && !isScreenSharingPaused ? "animate-pulse text-cyan-400" : ""} />
            <span>{isScreenSharing ? "SHARING" : "SHARE SCREEN"}</span>
          </button>

          {/* Desktop window controls (Electron only) */}
          {isElectron && (
            <div className="flex items-center gap-1 ml-3 pl-3 border-l border-white/10">
              <button
                onClick={() => { const v = !isPinned; setIsPinned(v); window.electronAPI?.togglePin(); }}
                className="p-1.5 rounded-md text-white/40 hover:text-cyan-300 hover:bg-white/5 transition cursor-pointer"
                title="Toggle Always-on-Top"
              >
                {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
              <button
                onClick={() => window.electronAPI?.minimize()}
                className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition cursor-pointer"
                title="Minimize"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => window.electronAPI?.toggleMaximize()}
                className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition cursor-pointer"
                title={isMaximized ? "Restore" : "Maximize"}
              >
                <Maximize2 size={12} />
              </button>
              <button
                onClick={() => window.electronAPI?.close()}
                className="p-1.5 rounded-md text-white/40 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                title="Close to tray"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* CORE AVATAR AND VISUALS */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-between py-6">

        {/* Holographic Projection Screen Widget (if website opened) */}
        <AnimatePresence>
          {activeProjectorUrl && (
            <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-2">
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-950/45 backdrop-blur-xl shadow-lg w-full max-w-md"
              >
                <div className="flex items-center gap-3 overflow-hidden text-left">
                  <div className="p-2 ml-1 rounded-xl bg-indigo-500/20 text-indigo-300">
                    <Globe size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold font-mono tracking-wide text-indigo-200 uppercase">Holographic Projection Broadcast</h4>
                    <p className="text-xs text-indigo-400 truncate max-w-[200px]">{activeProjectorUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveProjectorUrl(activeProjectorUrl)}
                    className="p-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-400 transition"
                    title="View Frame"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <button
                    onClick={() => setActiveProjectorUrl(null)}
                    className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Space Spacer to avoid head area */}
        <div className="h-10 sm:h-20" />

        {/* Cinematic dialogue layer overlay - Smooth, delicate text transitions with soft focus blur */}
        <div id="cinematic-subtitles" className="w-full max-w-3xl flex flex-col items-center justify-center text-center px-6 relative z-25 mt-auto mb-6 pointer-events-none min-h-[6rem]">
          {activeEmotion && activeEmotion !== "idle" && activeEmotion !== "calm" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="text-[10px] font-mono tracking-widest text-purple-300 uppercase px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 mb-3 shadow-[0_0_15px_rgba(168,85,247,0.35)] flex items-center gap-1.5 backdrop-blur-md font-semibold"
            >
              <Sparkles size={11} className="text-purple-400 animate-spin" style={{ animationDuration: "3s" }} />
              <span>AUTO ANIMATION: {activeEmotion}</span>
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            {(() => {
              const textType = modelCaption
                ? "model"
                : userCaption
                  ? "user"
                  : "status";

              const activeText = modelCaption
                ? modelCaption
                : userCaption
                  ? userCaption
                  : state === "listening"
                    ? "I am listening. Speak freely..."
                    : state === "connecting"
                      ? "Awakening presence..."
                      : "Connect core to awaken Alya.";

              return (
                <motion.div
                  key={textType}
                  initial={{ opacity: 0, y: 15, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -15, filter: "blur(6px)" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center justify-center w-full"
                >
                  {textType === "model" && (
                    <h2 className="text-xl sm:text-2xl font-light text-white leading-relaxed tracking-wide font-display max-w-2xl drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]">
                      {activeText}
                    </h2>
                  )}

                  {textType === "user" && (
                    <p className="text-cyan-300 font-mono text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>&ldquo;{activeText}&rdquo;</span>
                    </p>
                  )}

                  {textType === "status" && (
                    <span className="text-xs sm:text-sm uppercase tracking-[0.3em] font-medium text-white/30 font-sans tracking-widest drop-shadow-[0_1px_4px_rgba(0, 0, 0, 0.5)]">
                      {activeText}
                    </span>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Interactive suggestions prompt guide */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="mt-6 p-5 rounded-2xl border border-white/10 bg-slate-900/85 backdrop-blur-2xl max-w-md text-left w-full absolute z-40 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide">
                  <Compass size={16} className="text-indigo-400" />
                  <span>PLAYFUL CORE SUGGESTIONS</span>
                </div>
                <button
                  onClick={() => setShowGuide(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                 Alya is equipped with dynamic visual modules and standard text browser projectors. Here are clever triggers to try speaking aloud:
              </p>
              <div className="space-y-2 text-xs font-serif italic text-indigo-300">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Alya, change atmosphere of your core to crimson&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Shifts theme color background</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Open youtube.com on my screen please&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Invokes browser projector panel</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Tell me a witty joke and change background to gold&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Combines tools & voice</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Banner */}
        <AnimatePresence>
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="mt-6 flex items-start gap-3 p-4 rounded-2xl border border-rose-500/20 bg-rose-950/40 backdrop-blur-xl max-w-md w-full text-left"
            >
              <CircleAlert className="text-rose-400 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-rose-300 font-mono">Core Error Protocol</h4>
                <p className="text-xs text-rose-200 mt-1 leading-relaxed">{errorText}</p>
                <button
                  onClick={() => setErrorText(null)}
                  className="mt-2 text-[10px] font-bold text-rose-400 underline font-mono uppercase"
                >
                  Dismiss Code
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* FOOTER INTERFACE WITH WAVEFORM AND CONTROLS */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-5 mt-auto">

        {/* Dynamic Minimalist Waveform Visualizer */}
        <div className="flex items-center justify-center gap-1 h-8 w-44">
          {[12, 28, 16, 32, 20, 8].map((baseHeight, idx) => {
            let heightFactor = 0.35;
            if (state === "speaking") {
              heightFactor = 0.35 + Math.sin(Date.now() * 0.02 + idx * 0.9) * 0.65;
            } else if (state === "listening") {
              heightFactor = 0.2 + Math.sin(Date.now() * 0.01 + idx * 0.5) * 0.4;
            } else {
              heightFactor = idx % 2 === 0 ? 0.25 : 0.12;
            }
            const calculatedHeight = Math.max(3, baseHeight * heightFactor);

            return (
              <div
                key={idx}
                className={`w-0.5 rounded-full transition-all duration-300 ${state === "speaking" ? "bg-purple-400" : state === "listening" ? "bg-cyan-400" : "bg-white/10"
                  }`}
                style={{ height: `${calculatedHeight}px` }}
              />
            );
          })}
        </div>

        {/* Glossy Beautiful Primary Connector Core Node */}
        <div className="flex items-center justify-center relative mb-4">
          <button
            onClick={handleToggleConnection}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer ${state === "disconnected"
                ? "bg-white/10 hover:bg-white/15 border border-white/15 text-white shadow-[0_0_20px_rgba(255,255,255,0.02)] hover:scale-105 active:scale-95"
                : state === "listening"
                  ? "bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/80 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.3)] animate-pulse scale-105"
                  : state === "speaking"
                    ? "bg-purple-500/90 hover:bg-purple-600 border border-purple-400/95 text-white shadow-[0_0_35px_rgba(168,85,247,0.4)] scale-105"
                    : "bg-amber-600 border border-amber-300 text-white animate-spin"
              }`}
            title={state === "disconnected" ? "Awaken Alya" : "Sleep core"}
          >
            {state === "disconnected" ? (
              <Power className="opacity-80" size={24} />
            ) : state === "connecting" ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : state === "listening" ? (
              <Mic size={24} className="text-cyan-200" />
            ) : (
              <Volume2 size={24} className="text-white" />
            )}
          </button>

          {/* Quiet Reset Projection Anchor */}
          {(activeProjectorUrl || errorText) && (
            <button
              onClick={() => {
                if (activeProjectorUrl) setActiveProjectorUrl(null);
                setErrorText(null);
              }}
              className="absolute right-[-60px] p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition duration-150 cursor-pointer"
              title="Reset Screen Broadcasts"
            >
              <X size={16} />
            </button>
          )}
        </div>

      </footer>

      {/* Holographic Website frame projections */}
      <AnimatePresence>
        {activeProjectorUrl && (
          <BrowserAgent
            url={activeProjectorUrl}
            onClose={() => {
              setActiveProjectorUrl(null);
              setBrowserTrigger(null);
            }}
            actionTrigger={browserTrigger}
          />
        )}
      </AnimatePresence>

      {/* Dynamic Floating Glassmorphic Screen Sharing Control Hub */}
      <AnimatePresence>
        {isScreenSharing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: 50 }}
            className={`absolute bottom-6 md:bottom-10 right-6 md:right-10 z-50 w-72 p-4 rounded-2xl border ${isScreenSharingPaused
                ? "border-amber-500/20 bg-slate-950/70"
                : "border-cyan-500/20 bg-slate-950/70"
              } backdrop-blur-2xl shadow-2xl overflow-hidden`}
          >
            {/* Header / Indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isScreenSharingPaused ? "bg-amber-400" : "bg-cyan-400 animate-pulse"}`} />
                <span className="text-[10px] font-bold font-mono tracking-widest text-slate-200">
                  {isScreenSharingPaused ? "SCREEN VISION PAUSED" : "SCREEN VISION ACTIVE"}
                </span>
              </div>
              <button
                onClick={stopScreenSharing}
                className="text-slate-400 hover:text-white transition-colors duration-150 p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                title="Stop Sharing"
              >
                <X size={14} />
              </button>
            </div>

            {/* Smart Video PIP Preview Holder */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 mb-3 flex items-center justify-center group select-none">
              <video
                ref={(el) => {
                  if (el && screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                    el.srcObject = screenStreamRef.current;
                    el.muted = true;
                    el.play().catch(err => console.log("Mini preview stream play issue:", err));
                  }
                }}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isScreenSharingPaused ? "opacity-30 blur-sm" : "opacity-90"
                  }`}
                autoPlay
                playsInline
                muted
              />

              {isScreenSharingPaused && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-amber-400 font-bold px-2 py-1 bg-amber-950/40 border border-amber-500/20 rounded-md">
                    Transmission Paused
                  </span>
                </div>
              )}

              {!isScreenSharingPaused && screenVisionMode && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-400/20 text-[9px] font-mono text-cyan-300">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                  <span>Streaming FPS: 0.5</span>
                </div>
              )}
            </div>

            {/* Quick Action Control Strip */}
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              {isScreenSharingPaused ? (
                <button
                  onClick={resumeScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg text-xs font-mono font-medium text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Resume Streaming Feed"
                >
                  <Play size={10} />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-xs font-mono font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Pause Streaming Feed"
                >
                  <Pause size={10} />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={switchScreenShare}
                className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Choose Another Screen or Window"
              >
                <RefreshCw size={11} />
                <span>Switch</span>
              </button>

              <button
                onClick={stopScreenSharing}
                className="py-1.5 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-mono text-rose-400 flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                title="Terminate Stream"
              >
                <Square size={9} />
                <span>Stop</span>
              </button>
            </div>

            {/* Core Mode Configuration Toggle */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-left">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold font-mono text-slate-200">SCREEN VISION MODE</span>
                <span className="text-[8px] text-slate-400 uppercase font-mono max-w-[150px]">Gemini Auto-Analysis</span>
              </div>
              <button
                onClick={() => setScreenVisionMode(!screenVisionMode)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${screenVisionMode ? "bg-cyan-500" : "bg-white/10"
                  }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ease-in-out ${screenVisionMode ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Activity Status Panel & Confirmation Modal */}
      <AgentActivityPanel
        currentActivity={agentActivity}
        onOpenComposioModal={() => setShowComposioManager(true)}
        onCancelTask={handleCancelTask}
        onRetryTask={handleRetryTask}
        confirmationData={composioConfirmation}
        onConfirmAction={handleConfirmAction}
      />

      {/* Composio App Connection Manager Modal */}
      <ComposioConnectModal
        isOpen={showComposioManager}
        onClose={() => setShowComposioManager(false)}
      />

      {/* Recollections sliding core panel */}
      <MemoryDashboard
        isOpen={showMemoryDashboard}
        onClose={() => setShowMemoryDashboard(false)}
        memories={memories}
        onAddMemory={handleAddManualMemory}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
        onExtractMemories={handleExtractMemories}
        themeColor={themeColor}
      />

      {/* Life OS Dashboard Panel */}
      <LifeMemoryDashboard
        isOpen={showLifeDashboard}
        onClose={() => setShowLifeDashboard(false)}
        db={lifeDB}
        themeColor={themeColor}
        onRefresh={fetchLifeDB}
        onComposioConnect={(appName) => {
          fetch("/api/composio/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app: appName }),
          })
            .then((r) => r.json())
            .then((data) => {
              const url = data.redirectUrl || data.authUrl;
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            })
            .catch(console.error);
        }}
      />

      {/* Reminder Triggered Toast Notification */}
      <AnimatePresence>
        {activeReminder && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: "spring", damping: 22, stiffness: 200 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-start gap-3 p-4 rounded-2xl border border-amber-500/30 bg-amber-950/70 backdrop-blur-xl shadow-2xl max-w-sm w-full mx-4"
          >
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Bell size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold mb-0.5">
                Reminder from Alya
              </p>
              <p className="text-sm text-white font-medium leading-snug">
                {activeReminder.text}
              </p>
              <p className="text-[10px] font-mono text-slate-400 mt-1">
                Due: {new Date(activeReminder.dueAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => {
                  fetch(`/api/life/reminders/${activeReminder.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "completed" }),
                  }).then(() => {
                    setActiveReminder(null);
                    fetchLifeDB();
                  });
                }}
                className="p-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                title="Mark done"
              >
                <CheckCircle2 size={13} />
              </button>
              <button
                onClick={() => setActiveReminder(null)}
                className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 transition cursor-pointer"
                title="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animation & Stage Customization Panel */}
      <AnimationControlPanel
        isOpen={showAnimationPanel}
        onClose={() => setShowAnimationPanel(false)}
        settings={animationSettings}
        onUpdateSettings={(updates) =>
          setAnimationSettings((prev) => ({ ...prev, ...updates }))
        }
        onResetSettings={() => setAnimationSettings(DEFAULT_ANIMATION_SETTINGS)}
        onTriggerEmotion={(emo) => {
          setActiveEmotion(emo);
          setCharacterState("talking");
          setTimeout(() => setCharacterState("idle"), 2500);
        }}
        activeEmotion={activeEmotion}
        onToggleNativeFullscreen={handleToggleNativeFullscreen}
        isNativeFullscreen={isNativeFullscreen}
      />

      {/* Desktop Diagnostics & Controls Panel Overlay */}
      {showDiagnosticsPanel && (
        <DesktopDiagnosticsPanel
          onClose={() => setShowDiagnosticsPanel(false)}
          isProactivePaused={proactiveState === "STOPPED"}
          onToggleProactive={() => {
            const next = proactiveState === "STOPPED" ? "ACTIVE_CONVERSATION" : "STOPPED";
            setProactiveState(next);
          }}
          isScreenSharing={isScreenSharing}
          connectionState={state}
        />
      )}
    </div>
  );
}
