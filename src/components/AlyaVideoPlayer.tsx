/**
 * AlyaVideoPlayer
 * ================
 * A polished, state-aware video player for Alya's reaction library.
 *
 * Key behaviours:
 * • Smart clip rotation — tracks recently played clips per state; applies a
 *   cooldown so the same clip never immediately repeats.
 * • Dual-buffer crossfade — two <video> elements swap seamlessly near the end
 *   of each clip, eliminating black frames between loops or state changes.
 * • Near-end preload — the next selected clip is loaded into the standby
 *   buffer during the final CROSSFADE_LEAD_S seconds of the current clip.
 * • Graceful fallback — if a video fails to load, falls back silently to the
 *   next available clip or to the canvas visualizer via the `onFallback` prop.
 * • Reaction vs looping — "reaction" states (happy, shy…) play once and call
 *   `onClipEnd` so the parent state machine can transition; "looping" states
 *   (idle, listening…) loop the dual-buffer seamlessly.
 * • No black bars — video uses object-fit: contain; the container background
 *   is transparent so any source letterbox blends into the dark UI.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlyaState,
  AlyaVideoClip,
  ALYA_VIDEO_MAP,
  AnimationSettings,
  CLIP_COOLDOWN_MS,
  CROSSFADE_LEAD_S,
  DEFAULT_ANIMATION_SETTINGS,
  LOOPING_STATES,
  VideoFitMode,
} from "../lib/alyaVideoConfig";

// ── Internal types ────────────────────────────────────────────────────────────

interface ClipHistoryEntry {
  src: string;
  playedAt: number; // Date.now()
}

interface AlyaVideoPlayerProps {
  /** The emotion/state Alya should currently display */
  activeState: AlyaState;
  /** Called when a reaction clip finishes (not called for looping states) */
  onClipEnd?: () => void;
  /** Called when no video can be loaded for the current state */
  onFallback?: () => void;
  /** Overall visibility — when false the player fades to transparent */
  visible?: boolean;
  /** Opacity of the whole player (0–1); parent can use for crossfade-in/out */
  opacity?: number;
  /** Custom animation settings (fit mode, playback speed, scale, vignette softness) */
  settings?: Partial<AnimationSettings>;
}

// ── Helper: pick next clip ────────────────────────────────────────────────────

function pickClip(
  state: AlyaState,
  history: ClipHistoryEntry[],
  failedSrcs: Set<string>
): AlyaVideoClip | null {
  const pool = (ALYA_VIDEO_MAP[state] ?? ALYA_VIDEO_MAP["idle"]).filter(
    (c) => !failedSrcs.has(c.src)
  );
  if (!pool.length) return null;

  const now = Date.now();
  // Filter clips still on cooldown
  const available = pool.filter(
    (c) =>
      !history.some(
        (h) => h.src === c.src && now - h.playedAt < CLIP_COOLDOWN_MS
      )
  );

  // If all on cooldown, use the one that was played longest ago
  const candidate =
    available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : pool.reduce((oldest, c) => {
          const t = history.find((h) => h.src === c.src)?.playedAt ?? 0;
          const oldestT = history.find((h) => h.src === oldest.src)?.playedAt ?? 0;
          return t < oldestT ? c : oldest;
        }, pool[0]);

  return candidate;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const AlyaVideoPlayer: React.FC<AlyaVideoPlayerProps> = ({
  activeState,
  onClipEnd,
  onFallback,
  visible = true,
  opacity = 1,
  settings = DEFAULT_ANIMATION_SETTINGS,
}) => {
  const mergedSettings: AnimationSettings = {
    ...DEFAULT_ANIMATION_SETTINGS,
    ...settings,
  };
  const { fitMode, speed, scale, vignetteSoftness } = mergedSettings;

  // The two video buffers for seamless dual-buffer looping
  const bufARef = useRef<HTMLVideoElement | null>(null);
  const bufBRef = useRef<HTMLVideoElement | null>(null);

  // History of recently played clips (for cooldown logic)
  const historyRef = useRef<ClipHistoryEntry[]>([]);
  // Set of srcs that permanently failed to load this session
  const failedRef = useRef<Set<string>>(new Set());

  // Which buffer is currently "lead" (visible)
  const leadRef = useRef<"A" | "B">("A");

  // Current and next clip metadata
  const currentClipRef = useRef<AlyaVideoClip | null>(null);
  const nextClipRef = useRef<AlyaVideoClip | null>(null);

  // RAF id for the tick loop
  const rafRef = useRef<number>(0);

  // Whether the player has ever started (guard for initial render)
  const startedRef = useRef(false);

  // Expose a "transition in progress" flag to prevent re-entrant switches
  const switchingRef = useRef(false);
  // Guard: ensure onClipEnd is only called once per clip play
  const clipEndFiredRef = useRef(false);

  // Force re-render only for visible state changes (opacity driven by style)
  const [, forceRender] = useState(0);

  // Synchronize playback speed multiplier
  useEffect(() => {
    if (bufARef.current) bufARef.current.playbackRate = speed;
    if (bufBRef.current) bufBRef.current.playbackRate = speed;
  }, [speed]);

  // ── Core: select and load a clip ──────────────────────────────────────────

  const loadClipIntoBuffer = useCallback(
    (clip: AlyaVideoClip, buffer: "A" | "B") => {
      const el = buffer === "A" ? bufARef.current : bufBRef.current;
      if (!el) return;
      if (el.src !== clip.src && !el.src.endsWith(encodeURIComponent(clip.src.replace("/assets/", "")))) {
        el.src = clip.src;
        el.load();
      }
      el.playbackRate = speed;
    },
    [speed]
  );

  // ── Core: begin playing a clip from the start ────────────────────────────

  const playClipNow = useCallback(
    (clip: AlyaVideoClip) => {
      const bufA = bufARef.current;
      const bufB = bufBRef.current;
      if (!bufA || !bufB) return;

      // Record history
      historyRef.current = [
        ...historyRef.current.slice(-20),
        { src: clip.src, playedAt: Date.now() },
      ];
      currentClipRef.current = clip;

      // Determine which buffer is lead / trail
      const leadEl = leadRef.current === "A" ? bufA : bufB;
      const trailEl = leadRef.current === "A" ? bufB : bufA;

      // Immediately switch to the new clip in the lead buffer
      leadEl.src = clip.src;
      leadEl.currentTime = 0;
      leadEl.playbackRate = speed;
      leadEl.style.opacity = "1";
      trailEl.style.opacity = "0";

      const playP = leadEl.play();
      if (playP?.catch) playP.catch(() => {});

      // Pause trail
      try { trailEl.pause(); } catch (_) {}

      forceRender((n) => n + 1);
    },
    [speed]
  );

  // ── Core: transition to a new state / clip (with crossfade) ──────────────

  const transitionToClip = useCallback(
    (nextClip: AlyaVideoClip) => {
      const bufA = bufARef.current;
      const bufB = bufBRef.current;
      if (!bufA || !bufB || switchingRef.current) return;
      switchingRef.current = true;

      // Swap lead / trail
      const prevLead = leadRef.current;
      const nextLead: "A" | "B" = prevLead === "A" ? "B" : "A";
      leadRef.current = nextLead;

      const outEl = prevLead === "A" ? bufA : bufB;
      const inEl  = nextLead === "A" ? bufA : bufB;

      // Prepare incoming buffer
      inEl.src = nextClip.src;
      inEl.currentTime = 0;
      inEl.playbackRate = speed;
      inEl.style.opacity = "0";
      inEl.style.transition = "opacity 0.7s ease-in-out";
      const playP = inEl.play();
      if (playP?.catch) playP.catch(() => {});

      // Crossfade
      outEl.style.transition = "opacity 0.7s ease-in-out";

      requestAnimationFrame(() => {
        outEl.style.opacity = "0";
        inEl.style.opacity  = "1";
        setTimeout(() => {
          try { outEl.pause(); } catch (_) {}
          outEl.style.transition = "";
          inEl.style.transition  = "";
          switchingRef.current = false;

          historyRef.current = [
            ...historyRef.current.slice(-20),
            { src: nextClip.src, playedAt: Date.now() },
          ];
          currentClipRef.current = nextClip;
          nextClipRef.current = null;
        }, 750);
      });
    },
    [speed]
  );

  // ── RAF tick loop: handle near-end preload + looping / reaction end ───────

  useEffect(() => {
    const tick = () => {
      const bufA = bufARef.current;
      const bufB = bufBRef.current;
      const leadEl = (leadRef.current === "A" ? bufA : bufB);
      if (!leadEl || !currentClipRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dur = leadEl.duration;
      if (!dur || !isFinite(dur)) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const remaining = dur - leadEl.currentTime;
      const isLooping = LOOPING_STATES.has(activeState);

      // Preload next clip near end
      if (remaining <= CROSSFADE_LEAD_S + 0.5 && !nextClipRef.current && !switchingRef.current) {
        if (isLooping) {
          // For looping states: pick the same or alternate clip and preload
          const next = pickClip(activeState, historyRef.current, failedRef.current);
          if (next) {
            nextClipRef.current = next;
            const standby: "A" | "B" = leadRef.current === "A" ? "B" : "A";
            loadClipIntoBuffer(next, standby);
          }
        }
      }

      // Trigger crossfade at CROSSFADE_LEAD_S from end
      if (remaining <= CROSSFADE_LEAD_S && !switchingRef.current) {
        if (isLooping && nextClipRef.current) {
          transitionToClip(nextClipRef.current);
        } else if (!isLooping && !clipEndFiredRef.current) {
          // Notify parent state machine exactly once per clip
          clipEndFiredRef.current = true;
          onClipEnd?.();
          // Freeze last frame by pausing — parent will update activeState
          try { leadEl.pause(); } catch (_) {}
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeState, transitionToClip, loadClipIntoBuffer, onClipEnd]);

  // ── React to state changes ────────────────────────────────────────────────

  useEffect(() => {
    const clip = pickClip(activeState, historyRef.current, failedRef.current);
    if (!clip) {
      onFallback?.();
      return;
    }

    nextClipRef.current = null; // clear any pending preload
    clipEndFiredRef.current = false; // reset end guard for new clip

    if (!startedRef.current) {
      // First mount: directly load without crossfade
      startedRef.current = true;
      playClipNow(clip);
    } else {
      transitionToClip(clip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeState]);

  // ── Error handler ─────────────────────────────────────────────────────────

  const handleError = useCallback(
    (buffer: "A" | "B") => {
      const el = buffer === "A" ? bufARef.current : bufBRef.current;
      if (!el?.src) return;

      const failedSrc = el.src;
      // Normalise back from absolute URL if needed
      const key = failedSrc.includes("/assets/")
        ? "/assets/" + failedSrc.split("/assets/")[1]
        : failedSrc;
      failedRef.current.add(key);
      console.warn("[AlyaVideoPlayer] Failed to load:", key);

      // Try next clip
      const next = pickClip(activeState, historyRef.current, failedRef.current);
      if (next) {
        playClipNow(next);
      } else {
        onFallback?.();
      }
    },
    [activeState, onFallback, playClipNow]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  // Compute Vignette Mask based on softness (0 = crisp/full edge, 1 = deep smooth vignette)
  const maskInnerPct = Math.round(30 + vignetteSoftness * 35); // 30% to 65%
  const maskStyle = `radial-gradient(ellipse 88% 94% at 50% 50%, black ${maskInnerPct}%, transparent 100%)`;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    opacity: visible ? opacity : 0,
    transition: "opacity 0.7s ease-in-out, transform 0.4s ease-out",
    maskImage: maskStyle,
    WebkitMaskImage: maskStyle,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    background: "transparent",
  };

  const objectFitStyle: React.CSSProperties["objectFit"] =
    fitMode === "cover" ? "cover" : fitMode === "zoom" ? "cover" : "contain";

  const computedScale = fitMode === "zoom" ? scale * 1.25 : scale;

  const videoStyle: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    objectFit: objectFitStyle,
    transform: `scale(${computedScale})`,
    transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), object-fit 0.5s ease",
    background: "transparent",
    pointerEvents: "none",
    userSelect: "none",
  };

  return (
    <div style={containerStyle} aria-hidden="true">
      {/* Buffer A */}
      <video
        ref={bufARef}
        muted
        playsInline
        preload="auto"
        style={{ ...videoStyle, opacity: 1 }}
        onError={() => handleError("A")}
      />
      {/* Buffer B — staggered / standby */}
      <video
        ref={bufBRef}
        muted
        playsInline
        preload="auto"
        style={{ ...videoStyle, opacity: 0 }}
        onError={() => handleError("B")}
      />
    </div>
  );
};

export default AlyaVideoPlayer;
