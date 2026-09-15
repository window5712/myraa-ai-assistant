/**
 * MyraaCoreVisualizer — Alya's holographic presence layer
 * ========================================================
 * Renders the full-viewport animated canvas (particles, volumetric beams, glow)
 * plus the Alya reaction video layer using the new AlyaVideoPlayer system.
 *
 * State Machine flow:
 *   disconnected   → idle
 *   connecting     → idle
 *   listening      → listening
 *   characterState "thinking" → thinking
 *   characterState "talking"  → speaking + emotion overlay
 *   emotion detected          → reaction clip → auto-return
 *   first connect             → greeting → listening
 *   disconnect signal         → farewell → idle
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { MyraaAudioSession, LiveState } from "../lib/audio";
import {
  AlyaState,
  AnimationSettings,
  DEFAULT_ANIMATION_SETTINGS,
  EMOTION_COMBOS,
  POST_REACTION_STATE,
  REACTION_STATES,
  LOOPING_STATES,
} from "../lib/alyaVideoConfig";
import { AlyaVideoPlayer } from "./AlyaVideoPlayer";

// ── Public types ──────────────────────────────────────────────────────────────

export type AlyaEmotion = AlyaState;

// Backward-compatible alias
export type MyraaEmotion = AlyaEmotion;

// ── Props ─────────────────────────────────────────────────────────────────────

interface AlyaCoreVisualizerProps {
  session: MyraaAudioSession | null;
  state: LiveState;
  themeColor: string;
  activeEmotion?: AlyaEmotion;
  characterState: "idle" | "thinking" | "talking";
  animationSettings?: AnimationSettings;
  /** Called on first connection to signal greeting → listening flow */
  onFirstConnect?: () => void;
}

// ── State machine helpers ─────────────────────────────────────────────────────

function resolveState(
  liveState: LiveState,
  emotion: AlyaEmotion,
  charState: "idle" | "thinking" | "talking",
  intensity: number // 0–1; higher = more expressive clip choice
): AlyaState {
  // 1. Disconnected / connecting → idle (no conversation)
  if (liveState === "disconnected" || liveState === "connecting") return "idle";

  // 2. Strong emotions always override — check combos first
  const comboKey = `${emotion}+${charState === "thinking" ? "thinking" : ""}`.replace(/\+$/, "");
  const combo = EMOTION_COMBOS[comboKey];
  if (combo) return combo;

  // 3. Specific emotion states (high intensity or named)
  if (emotion !== "idle" && emotion !== "calm") {
    // Map AlyaEmotion to AlyaState directly (they share names)
    const direct = emotion as AlyaState;
    if (REACTION_STATES.has(direct)) return direct;
    if (LOOPING_STATES.has(direct)) return direct;
  }

  // 4. Character state fallback
  if (charState === "thinking") return "thinking";
  if (charState === "talking") return "speaking";

  // 5. Default to listening while live
  return liveState === "speaking" ? "speaking" : "listening";
}

// ── Component ─────────────────────────────────────────────────────────────────

export const AlyaCoreVisualizer: React.FC<AlyaCoreVisualizerProps> = ({
  session,
  state,
  themeColor,
  activeEmotion = "idle",
  characterState,
  animationSettings = DEFAULT_ANIMATION_SETTINGS,
}) => {
  const mergedSettings: AnimationSettings = {
    ...DEFAULT_ANIMATION_SETTINGS,
    ...animationSettings,
  };
  const { isStageFullscreen, glowIntensity } = mergedSettings;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Mouse tracking for canvas parallax
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.4 });
  const targetMouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.4 });

  // Audio volume smoothing
  const speechVolumeRef = useRef<number>(0);

  // Particle system
  const particlesRef = useRef<Array<{ x: number; y: number; speed: number; size: number; opacity: number }>>([]);

  // ── Video state machine ────────────────────────────────────────────────────
  const [videoState, setVideoState] = useState<AlyaState>("idle");
  const [videoVisible, setVideoVisible] = useState(false);
  const [videoFallback, setVideoFallback] = useState(false);

  // Track whether we've greeted since last connect
  const hasGreetedRef = useRef(false);
  // Prev live state for transition detection
  const prevLiveStateRef = useRef<LiveState>("disconnected");
  // Timer for returning to base state after a reaction
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Emotion intensity (simple: non-idle = 0.7, repeated = 1.0)
  const emotionIntensityRef = useRef(0.5);
  const prevEmotionRef = useRef<AlyaEmotion>("idle");

  // ── Drive video state from props ───────────────────────────────────────────
  useEffect(() => {
    if (reactionTimerRef.current) {
      clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = null;
    }

    // Detect intensity boost when emotion repeats
    const intensity =
      activeEmotion !== "idle" && activeEmotion === prevEmotionRef.current
        ? Math.min(1, emotionIntensityRef.current + 0.2)
        : 0.5;
    emotionIntensityRef.current = intensity;
    prevEmotionRef.current = activeEmotion;

    // Greeting on first connect
    if (
      state !== "disconnected" &&
      prevLiveStateRef.current === "disconnected" &&
      !hasGreetedRef.current
    ) {
      hasGreetedRef.current = true;
      setVideoState("greeting");
      setVideoVisible(true);
      prevLiveStateRef.current = state;
      return;
    }

    // Farewell on disconnect
    if (state === "disconnected" && prevLiveStateRef.current !== "disconnected") {
      hasGreetedRef.current = false;
      setVideoState("farewell");
      setVideoVisible(true);
      prevLiveStateRef.current = state;
      return;
    }

    prevLiveStateRef.current = state;

    // Disconnected → hide video, show canvas only
    if (state === "disconnected") {
      setVideoState("idle");
      setVideoVisible(false);
      return;
    }

    // Determine target state from emotion + character state
    const target = resolveState(state, (activeEmotion || "idle") as AlyaEmotion, characterState, intensity);
    setVideoState(target);
    setVideoVisible(true);
  }, [state, activeEmotion, characterState]);

  // ── Handle reaction clip end ───────────────────────────────────────────────
  const handleClipEnd = useCallback(() => {
    // Determine what to return to
    const post = POST_REACTION_STATE[videoState];
    if (post) {
      setVideoState(post);
    } else {
      // Default: go back to listening if live, else idle
      setVideoState(
        prevLiveStateRef.current !== "disconnected" ? "listening" : "idle"
      );
    }
  }, [videoState]);

  // ── Handle video load failure ──────────────────────────────────────────────
  const handleVideoFallback = useCallback(() => {
    setVideoFallback(true);
    setVideoVisible(false);
    console.warn("[AlyaCoreVisualizer] Video fallback to canvas mode");
  }, []);

  // ── Canvas rendering ───────────────────────────────────────────────────────

  const getGlowColors = useCallback(() => {
    switch (themeColor) {
      case "violet":    return { primary: "rgba(147, 51, 234, 1)",  secondary: "rgba(192, 38, 211, 0.8)", glow: "rgba(168, 85, 247, 0.7)" };
      case "crimson":   return { primary: "rgba(225, 29, 72, 1)",   secondary: "rgba(234, 88, 12, 0.8)",  glow: "rgba(244, 63, 94, 0.7)"  };
      case "emerald":   return { primary: "rgba(5, 150, 105, 1)",   secondary: "rgba(13, 148, 136, 0.8)", glow: "rgba(16, 185, 129, 0.7)" };
      case "celestial": return { primary: "rgba(2, 132, 199, 1)",   secondary: "rgba(8, 145, 178, 0.8)",  glow: "rgba(14, 165, 233, 0.7)" };
      case "gold":      return { primary: "rgba(202, 138, 4, 1)",   secondary: "rgba(217, 119, 6, 0.8)",  glow: "rgba(234, 179, 8, 0.7)"  };
      case "rose":      return { primary: "rgba(219, 39, 119, 1)",  secondary: "rgba(220, 38, 38, 0.8)",  glow: "rgba(236, 72, 153, 0.7)" };
      default:          return { primary: "rgba(34, 211, 238, 1)",  secondary: "rgba(79, 70, 229, 0.8)",  glow: "rgba(6, 182, 212, 0.7)"  };
    }
  }, [themeColor]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      targetMouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width  = (canvas.width  = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const generateParticles = () => {
      const baseCount = Math.floor(width / 24);
      const count = Math.min(100, Math.floor(baseCount * Math.max(0.4, glowIntensity)));
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height + height * 0.1,
        speed: Math.random() * 0.35 + 0.12,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
      }));
    };
    generateParticles();

    const handleResize = () => {
      if (!canvas) return;
      width  = canvas.width  = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      generateParticles();
    };
    window.addEventListener("resize", handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const colors = getGlowColors();

      // Audio analysis
      let audioLevel = 0;
      const bufferLength = 64;
      const dataArray = new Uint8Array(bufferLength);
      let activeAnalyser = null;
      if (state === "speaking" && session?.outputAnalyser) activeAnalyser = session.outputAnalyser;
      else if (state === "listening" && session?.inputAnalyser) activeAnalyser = session.inputAnalyser;

      if (activeAnalyser) {
        try {
          activeAnalyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          audioLevel = sum / bufferLength;
        } catch (_) {}
      }
      speechVolumeRef.current += (audioLevel / 255 - speechVolumeRef.current) * 0.2;

      const baseScale = height / 440;
      const s = Math.max(0.95, Math.min(1.85, baseScale));

      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.05;

      const centerX = width / 2;

      // Volumetric projector beam (scaled by glowIntensity)
      ctx.save();
      const projectorCenterY = height + 40;
      const baseDiameterX = 280 * s * Math.max(0.5, glowIntensity * 0.85);
      const conicalBeamGrad = ctx.createLinearGradient(centerX, height * 0.25, centerX, height);
      conicalBeamGrad.addColorStop(0,    "rgba(0,0,0,0)");
      conicalBeamGrad.addColorStop(0.4,  colors.primary.replace("1)", `${0.03 * glowIntensity})`));
      conicalBeamGrad.addColorStop(0.75, colors.primary.replace("1)", `${0.08 * glowIntensity})`));
      conicalBeamGrad.addColorStop(1,    colors.secondary.replace("0.8)", `${0.18 * glowIntensity})`));
      ctx.fillStyle = conicalBeamGrad;
      ctx.beginPath();
      ctx.moveTo(centerX - baseDiameterX * 0.35, projectorCenterY - 145);
      ctx.lineTo(centerX + baseDiameterX * 0.35, projectorCenterY - 145);
      ctx.lineTo(centerX + baseDiameterX * 1.5, height);
      ctx.lineTo(centerX - baseDiameterX * 1.5, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Subtle glitch during connecting
      const applyGlitch = (state === "connecting" && Math.random() < 0.1) || (Math.random() < 0.005);
      if (applyGlitch) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2);
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(236,72,153,0.03)" : "rgba(34,211,238,0.03)";
        ctx.fillRect(0, 0, width, height);
      }

      // Holographic particles
      particlesRef.current.forEach((p) => {
        const riseSpeed = p.speed * (1 + speechVolumeRef.current * 1.8);
        p.y -= riseSpeed;
        p.x += Math.sin(p.y * 0.015 + p.size) * 0.4;
        const currentOpacity = p.opacity * Math.max(0, p.y / height) * Math.min(1.5, glowIntensity);
        if (p.y < height * 0.12) {
          p.y = height + Math.random() * 30;
          p.x = Math.random() * width;
        }
        ctx.fillStyle = colors.primary.replace("1)", `${currentOpacity * 0.45})`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * s, 0, Math.PI * 2);
        ctx.fill();
      });

      if (applyGlitch) ctx.restore();

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [session, state, themeColor, getGlowColors, glowIntensity]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const glowSize = Math.round(500 * Math.max(0.5, glowIntensity));
  const glowOpacity = Math.min(0.6, 0.25 * glowIntensity);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">

      {/* ── 1. Atmospheric backlight glow (behind everything) */}
      <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-0">
        <div
          style={{
            width: `${glowSize}px`,
            height: `${glowSize}px`,
            opacity: glowOpacity,
          }}
          className={`rounded-full blur-[140px] bg-gradient-to-tr transition-all duration-700 ${
            themeColor === "violet"    ? "from-purple-600/40 to-fuchsia-600/10" :
            themeColor === "crimson"   ? "from-rose-600/40 to-orange-600/10"    :
            themeColor === "emerald"   ? "from-emerald-600/40 to-teal-600/10"   :
            themeColor === "celestial" ? "from-sky-600/40 to-cyan-600/10"       :
            themeColor === "gold"      ? "from-amber-600/40 to-yellow-600/10"   :
            themeColor === "rose"      ? "from-rose-600/40 to-pink-600/10"      :
                                         "from-indigo-600/40 to-cyan-600/10"
          }`}
        />
      </div>

      {/* ── 2. Alya reaction video layer ──────────────────────────────────── */}
      <div
        id="alya-animated-presence"
        className="absolute z-10 w-full h-full flex items-center justify-center pointer-events-none"
        aria-label="Alya character animation stage"
      >
        {/*
          Dynamic Stage Container:
          Expands to 100% full viewport when isStageFullscreen is active,
          or stays elegantly constrained in standard mode.
        */}
        <div
          className="relative select-none pointer-events-none transition-all duration-500 ease-out"
          style={{
            width: "100%",
            maxWidth: isStageFullscreen ? "100vw" : "860px",
            height: isStageFullscreen ? "100vh" : "min(74vh, 700px)",
            filter: `drop-shadow(0 0 ${Math.round(40 * glowIntensity)}px rgba(99,102,241,${0.12 * glowIntensity}))`,
          }}
        >
          {/* Subtle outer glow ring */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: isStageFullscreen ? "0px" : "2.5rem",
              background: `radial-gradient(ellipse at 50% 100%, rgba(99,102,241,${0.06 * glowIntensity}) 0%, transparent 70%)`,
            }}
          />

          {/* The video player (renders active reaction clip with crossfade & settings) */}
          {!videoFallback && (
            <AlyaVideoPlayer
              activeState={videoState}
              onClipEnd={handleClipEnd}
              onFallback={handleVideoFallback}
              visible={videoVisible}
              opacity={1}
              settings={mergedSettings}
            />
          )}

          {/* Fallback canvas-only message */}
          {videoFallback && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            />
          )}

          {/* Cybernetic edge guard — subtle inner vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: isStageFullscreen ? "0px" : "2.5rem",
              background:
                "radial-gradient(ellipse 110% 110% at 50% 50%, transparent 55%, rgba(0,0,0,0.25) 100%)",
            }}
          />
        </div>
      </div>

      {/* ── 3. Holographic particle canvas (foreground overlay) ───────────── */}
      <canvas
        id="alya-hologram-living-canvas"
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
        aria-hidden="true"
      />
    </div>
  );
};

// ── Backward-compatible re-exports ────────────────────────────────────────────
export const MyraaCoreVisualizer = AlyaCoreVisualizer;
