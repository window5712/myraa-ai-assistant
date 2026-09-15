import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Maximize2,
  Minimize2,
  Gauge,
  Sliders,
  X,
  RotateCcw,
  Tv,
  Smile,
  Zap,
  Sun,
  Eye,
  Check,
  Expand,
  Monitor
} from "lucide-react";
import {
  AlyaState,
  AnimationSettings,
  DEFAULT_ANIMATION_SETTINGS,
  VideoFitMode,
} from "../lib/alyaVideoConfig";
import { AlyaEmotion } from "./MyraaCoreVisualizer";

interface AnimationControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AnimationSettings;
  onUpdateSettings: (updates: Partial<AnimationSettings>) => void;
  onResetSettings: () => void;
  onTriggerEmotion: (emotion: AlyaEmotion) => void;
  activeEmotion?: AlyaEmotion;
  onToggleNativeFullscreen: () => void;
  isNativeFullscreen: boolean;
}

const EMOTION_PALETTE: Array<{ id: AlyaEmotion; label: string; icon: string }> = [
  { id: "greeting", label: "Waving Hello", icon: "👋" },
  { id: "happy", label: "Happy Smile", icon: "😊" },
  { id: "playful", label: "Winking / Playful", icon: "😉" },
  { id: "shy", label: "Shy / Blush", icon: "😳" },
  { id: "surprised", label: "Surprised", icon: "😲" },
  { id: "laughing", label: "Laughing", icon: "🤣" },
  { id: "excited", label: "Excited Hype", icon: "⚡" },
  { id: "curious", label: "Curious", icon: "🧐" },
  { id: "thinking", label: "Thinking", icon: "🤔" },
  { id: "satisfied", label: "Satisfied / Success", icon: "✨" },
  { id: "calm", label: "Gentle Calm", icon: "🌊" },
  { id: "proud", label: "Proud", icon: "🏆" },
  { id: "sad", label: "Sad", icon: "💙" },
  { id: "processing", label: "Processing", icon: "⚙️" },
];

export const AnimationControlPanel: React.FC<AnimationControlPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
  onTriggerEmotion,
  activeEmotion = "idle",
  onToggleNativeFullscreen,
  isNativeFullscreen,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-indigo-500/30 bg-slate-950/85 backdrop-blur-2xl shadow-2xl p-6 text-white custom-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-widest font-mono text-purple-200 uppercase">
                  Animation & Stage Controls
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Fine-tune Alya&apos;s full-screen video stage, speed &amp; feeling
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onResetSettings}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition text-xs font-mono flex items-center gap-1 cursor-pointer"
                title="Reset Default Settings"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="space-y-6">

            {/* 1. Stage & Fullscreen Controls */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                <Tv size={14} className="text-cyan-400" />
                <span>1. Viewport &amp; Fullscreen Stage</span>
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Fullscreen Video Stage Toggle */}
                <button
                  onClick={() =>
                    onUpdateSettings({ isStageFullscreen: !settings.isStageFullscreen })
                  }
                  className={`p-3.5 rounded-2xl border flex flex-col items-start gap-1 transition text-left cursor-pointer ${
                    settings.isStageFullscreen
                      ? "border-cyan-400 bg-cyan-500/20 text-white shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold font-mono">Stage Immersion</span>
                    {settings.isStageFullscreen ? (
                      <Check size={14} className="text-cyan-400" />
                    ) : (
                      <Expand size={14} className="opacity-40" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {settings.isStageFullscreen
                      ? "Full-Bleed Stage Active"
                      : "Standard Balanced UI"}
                  </span>
                </button>

                {/* Native Browser Fullscreen Toggle */}
                <button
                  onClick={onToggleNativeFullscreen}
                  className={`p-3.5 rounded-2xl border flex flex-col items-start gap-1 transition text-left cursor-pointer ${
                    isNativeFullscreen
                      ? "border-purple-400 bg-purple-500/20 text-white shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold font-mono">Browser Fullscreen</span>
                    {isNativeFullscreen ? (
                      <Minimize2 size={14} className="text-purple-300" />
                    ) : (
                      <Maximize2 size={14} className="opacity-40" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {isNativeFullscreen ? "True Fullscreen (Esc to exit)" : "Toggle Native Window"}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Fit Mode Selection */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                <Sliders size={14} className="text-indigo-400" />
                <span>2. Video Fit &amp; Framing</span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                {(["contain", "cover", "zoom"] as VideoFitMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onUpdateSettings({ fitMode: mode })}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-mono capitalize transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      settings.fitMode === mode
                        ? "border-indigo-400 bg-indigo-500/25 text-white font-bold shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                        : "border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span>{mode === "contain" ? "Natural Fit" : mode === "cover" ? "Full Edge" : "Portrait Zoom"}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Playback Speed */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                  <Gauge size={14} className="text-amber-400" />
                  <span>3. Animation Speed Rate</span>
                </label>
                <span className="text-xs font-mono font-bold text-amber-300">
                  {settings.speed}x
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[0.75, 1.0, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onUpdateSettings({ speed: spd })}
                    className={`py-2 rounded-xl border text-xs font-mono transition cursor-pointer ${
                      settings.speed === spd
                        ? "border-amber-400 bg-amber-500/20 text-amber-200 font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                        : "border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Fine-Tuning Sliders */}
            <div className="space-y-4 pt-2 border-t border-white/10">
              <label className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                <Sun size={14} className="text-rose-400" />
                <span>4. Character Scale &amp; Atmosphere Glow</span>
              </label>

              {/* Scale Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Character Scale</span>
                  <span className="text-indigo-300 font-bold">
                    {Math.round(settings.scale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={settings.scale}
                  onChange={(e) => onUpdateSettings({ scale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>

              {/* Glow Intensity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Atmospheric Aura Glow</span>
                  <span className="text-cyan-300 font-bold">
                    {Math.round(settings.glowIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2.0"
                  step="0.1"
                  value={settings.glowIntensity}
                  onChange={(e) =>
                    onUpdateSettings({ glowIntensity: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Vignette Softness Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Vignette Edge Softness</span>
                  <span className="text-purple-300 font-bold">
                    {Math.round(settings.vignetteSoftness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={settings.vignetteSoftness}
                  onChange={(e) =>
                    onUpdateSettings({ vignetteSoftness: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
              </div>
            </div>

            {/* 5. Interactive Emotion Testing Palette */}
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                  <Smile size={14} className="text-emerald-400" />
                  <span>5. Trigger Emotion Reaction</span>
                </label>
                <span className="text-[10px] font-mono text-slate-400 uppercase">
                  Current: <strong className="text-emerald-300">{activeEmotion}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {EMOTION_PALETTE.map((item) => {
                  const isActive = activeEmotion === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTriggerEmotion(item.id)}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                        isActive
                          ? "border-emerald-400 bg-emerald-500/20 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                          : "border-white/5 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="text-xs font-mono truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end">
            <button
              onClick={onClose}
              className="py-2.5 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-mono font-bold tracking-wider transition cursor-pointer"
            >
              DONE
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
