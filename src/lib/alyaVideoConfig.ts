/**
 * Alya Video State Configuration
 * ================================
 * Centralized map of every emotion/state → list of MP4 clips.
 * To add new videos: drop the file into assets/ and add an entry below.
 * Multiple clips per state enable variety; the player auto-rotates them.
 */

// ── Emotion / State Types ────────────────────────────────────────────────────

export type AlyaState =
  | "idle"
  | "greeting"
  | "listening"
  | "thinking"
  | "processing"
  | "speaking"
  | "happy"
  | "excited"
  | "curious"
  | "surprised"
  | "shy"
  | "sad"
  | "playful"
  | "laughing"
  | "satisfied"
  | "calm"
  | "farewell"
  | "proud"
  | "angry"
  | "embarrassed"
  | "confused";

// MyraaEmotion compatibility alias (for existing App.tsx usage)
export type MyraaEmotion = AlyaState;

// ── Video Clip Descriptor ────────────────────────────────────────────────────

export interface AlyaVideoClip {
  /** Path relative to server root, e.g. /assets/foo.mp4 */
  src: string;
  /** Human-readable label for debugging */
  label: string;
  /**
   * Estimated natural aspect ratio of the character content within the video.
   * Used to pick the best fit strategy. All current clips are 16:9 or portrait.
   */
  aspectHint?: "portrait" | "landscape" | "square";
}

// ── Animation Settings & Customization Controls ──────────────────────────────

export type VideoFitMode = "contain" | "cover" | "zoom";

export interface AnimationSettings {
  /** How the video fills the character container: contain, cover (edge-to-edge), or zoom */
  fitMode: VideoFitMode;
  /** Playback speed multiplier (0.75x to 1.5x) */
  speed: number;
  /** Character scale multiplier (0.7x to 1.5x) */
  scale: number;
  /** Ambient atmospheric glow intensity (0.2x to 2.0x) */
  glowIntensity: number;
  /** Edge vignette mask softness (0.0 to 1.0) */
  vignetteSoftness: number;
  /** Full-screen video stage mode active */
  isStageFullscreen: boolean;
  /** Auto emotion reactivity enabled */
  autoEmotions: boolean;
}

export const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  fitMode: "contain",
  speed: 1.0,
  scale: 1.0,
  glowIntensity: 1.0,
  vignetteSoftness: 0.8,
  isStageFullscreen: false,
  autoEmotions: true,
};


// ── Video State Map ──────────────────────────────────────────────────────────
//
// All 16 MP4 files are listed below, each assigned to one or more states.
// Files with the Unicode ellipsis (…) character are the actual filenames on disk.
//
// STATES WITH MULTIPLE CLIPS: the player rotates through them with a cooldown
// so Alya never immediately repeats the same clip.

export const ALYA_VIDEO_MAP: Record<AlyaState, AlyaVideoClip[]> = {

  // ── Idle / Waiting ────────────────────────────────────────────────────────
  idle: [
    {
      src: "/assets/Character_waiting_in_idle_animation_202608162329.mp4",
      label: "Character Idle Waiting",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Alya_gentle_reaction_animation_202608162351.mp4",
      label: "Alya Gentle / Calm",
      aspectHint: "landscape",
    },
  ],

  // ── Calm / Relaxed ────────────────────────────────────────────────────────
  calm: [
    {
      src: "/assets/Alya_gentle_reaction_animation_202608162351.mp4",
      label: "Alya Gentle / Calm",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_waiting_in_idle_animation_202608162329.mp4",
      label: "Character Idle Waiting",
      aspectHint: "landscape",
    },
  ],

  // ── Greeting (first connect) ───────────────────────────────────────────────
  greeting: [
    {
      src: "/assets/Alya_waving_and_smiling_202608162352.mp4",
      label: "Alya Waving & Smiling",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_blinking_and_smiling_a\u2026_202608162352.mp4",
      label: "Character Blinking & Smiling",
      aspectHint: "landscape",
    },
  ],

  // ── Farewell (disconnect) ─────────────────────────────────────────────────
  farewell: [
    {
      src: "/assets/Alya_waving_and_smiling_202608162352.mp4",
      label: "Alya Waving Goodbye",
      aspectHint: "landscape",
    },
  ],

  // ── Listening ────────────────────────────────────────────────────────────
  listening: [
    {
      src: "/assets/Alya_listening_and_nodding_anima\u2026_202608162351.mp4",
      label: "Alya Listening & Nodding",
      aspectHint: "landscape",
    },
  ],

  // ── Thinking ─────────────────────────────────────────────────────────────
  thinking: [
    {
      src: "/assets/Animated_character_thinking_and_\u2026_202608162350.mp4",
      label: "Animated Character Thinking",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_thinking_reaction_anim\u2026_202608162351.mp4",
      label: "Character Thinking Reaction",
      aspectHint: "landscape",
    },
  ],

  // ── Processing (deeper computation) ──────────────────────────────────────
  processing: [
    {
      src: "/assets/Character_thinking_reaction_anim\u2026_202608162351.mp4",
      label: "Character Thinking Reaction (processing)",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Animated_character_thinking_and_\u2026_202608162350.mp4",
      label: "Animated Character Thinking",
      aspectHint: "landscape",
    },
  ],

  // ── Speaking (neutral talking) ────────────────────────────────────────────
  speaking: [
    {
      src: "/assets/Alya_listening_and_nodding_anima\u2026_202608162351.mp4",
      label: "Alya Nodding (speaking layer)",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Alya_gentle_reaction_animation_202608162351.mp4",
      label: "Alya Gentle (speaking layer)",
      aspectHint: "landscape",
    },
  ],

  // ── Happy ─────────────────────────────────────────────────────────────────
  happy: [
    {
      src: "/assets/Character_smiling_happily_in_ani\u2026_202608162349.mp4",
      label: "Character Smiling Happily",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_blinking_and_smiling_a\u2026_202608162352.mp4",
      label: "Character Blinking & Smiling",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Alya_winking_and_smiling_202608162350.mp4",
      label: "Alya Winking & Smiling",
      aspectHint: "landscape",
    },
  ],

  // ── Excited ───────────────────────────────────────────────────────────────
  excited: [
    {
      src: "/assets/Animated_character_reacting_with\u2026_202608162349.mp4",
      label: "Animated Character Excited Reaction",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_laughing_reaction_anim\u2026_202608162350.mp4",
      label: "Character Laughing (excited)",
      aspectHint: "landscape",
    },
  ],

  // ── Curious ───────────────────────────────────────────────────────────────
  curious: [
    {
      src: "/assets/Alya_expressing_curious_reaction_202608162350.mp4",
      label: "Alya Curious Reaction",
      aspectHint: "landscape",
    },
  ],

  // ── Surprised ─────────────────────────────────────────────────────────────
  surprised: [
    {
      src: "/assets/Alya_showing_surprised_reaction_202608162350.mp4",
      label: "Alya Surprised Reaction",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Animated_character_reacting_with\u2026_202608162349.mp4",
      label: "Animated Character Reacting (surprised)",
      aspectHint: "landscape",
    },
  ],

  // ── Shy / Embarrassed ─────────────────────────────────────────────────────
  shy: [
    {
      src: "/assets/Alya_showing_shy_reaction_202608162349.mp4",
      label: "Alya Shy Reaction",
      aspectHint: "landscape",
    },
  ],

  // ── Embarrassed (alias for shy) ───────────────────────────────────────────
  embarrassed: [
    {
      src: "/assets/Alya_showing_shy_reaction_202608162349.mp4",
      label: "Alya Shy / Embarrassed",
      aspectHint: "landscape",
    },
  ],

  // ── Sad ───────────────────────────────────────────────────────────────────
  sad: [
    {
      src: "/assets/Alya_showing_sad_reaction_202608162349.mp4",
      label: "Alya Sad Reaction",
      aspectHint: "landscape",
    },
  ],

  // ── Playful ───────────────────────────────────────────────────────────────
  playful: [
    {
      src: "/assets/Alya_winking_and_smiling_202608162350.mp4",
      label: "Alya Winking & Smiling (playful)",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_smiling_happily_in_ani\u2026_202608162349.mp4",
      label: "Character Smiling (playful)",
      aspectHint: "landscape",
    },
  ],

  // ── Laughing ──────────────────────────────────────────────────────────────
  laughing: [
    {
      src: "/assets/Character_laughing_reaction_anim\u2026_202608162350.mp4",
      label: "Character Laughing",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Animated_character_reacting_with\u2026_202608162349.mp4",
      label: "Animated Character Excited (laughing alt)",
      aspectHint: "landscape",
    },
  ],

  // ── Satisfied / Success ───────────────────────────────────────────────────
  satisfied: [
    {
      src: "/assets/Character_reacting_with_satisfie\u2026_202608162351.mp4",
      label: "Character Satisfied Reaction",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Character_blinking_and_smiling_a\u2026_202608162352.mp4",
      label: "Character Smiling (satisfied alt)",
      aspectHint: "landscape",
    },
  ],

  // ── Proud ─────────────────────────────────────────────────────────────────
  proud: [
    {
      src: "/assets/Character_reacting_with_satisfie\u2026_202608162351.mp4",
      label: "Character Satisfied / Proud",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Alya_waving_and_smiling_202608162352.mp4",
      label: "Alya Waving (proud)",
      aspectHint: "landscape",
    },
  ],

  // ── Angry ─────────────────────────────────────────────────────────────────
  // No dedicated angry clip in current library → falls back to sad
  angry: [
    {
      src: "/assets/Alya_showing_sad_reaction_202608162349.mp4",
      label: "Alya Sad (angry fallback)",
      aspectHint: "landscape",
    },
  ],

  // ── Confused ─────────────────────────────────────────────────────────────
  confused: [
    {
      src: "/assets/Alya_expressing_curious_reaction_202608162350.mp4",
      label: "Alya Curious (confused)",
      aspectHint: "landscape",
    },
    {
      src: "/assets/Animated_character_thinking_and_\u2026_202608162350.mp4",
      label: "Character Thinking (confused alt)",
      aspectHint: "landscape",
    },
  ],
};

// ── Emotion Combo Resolver ────────────────────────────────────────────────────
// Maps combined emotion signatures to a single AlyaState.
// Format: "primary+secondary"

export const EMOTION_COMBOS: Record<string, AlyaState> = {
  "happy+excited":    "laughing",
  "excited+happy":    "laughing",
  "shy+happy":        "shy",
  "happy+shy":        "shy",
  "sad+calm":         "calm",
  "calm+sad":         "calm",
  "curious+thinking": "curious",
  "thinking+curious": "curious",
  "surprised+excited":"excited",
  "excited+surprised":"excited",
  "proud+happy":      "satisfied",
  "happy+proud":      "satisfied",
  "playful+happy":    "playful",
  "happy+playful":    "playful",
  "focused+thinking": "thinking",
  "thinking+focused": "thinking",
  "sad+angry":        "sad",
  "angry+sad":        "sad",
};

// ── State Machine Transition Rules ───────────────────────────────────────────
// After a short reaction clip ends, Alya returns to this state automatically.
// (overridden by live voice state if it has changed)

export const POST_REACTION_STATE: Partial<Record<AlyaState, AlyaState>> = {
  greeting:   "listening",
  farewell:   "idle",
  excited:    "happy",
  surprised:  "curious",
  laughing:   "happy",
  satisfied:  "calm",
  proud:      "calm",
  playful:    "happy",
  shy:        "calm",
  embarrassed:"calm",
  sad:        "calm",
  angry:      "calm",
  confused:   "thinking",
  curious:    "listening",
  happy:      "calm",
};

// States that are "reaction" clips (short, one-shot; auto-return to parent)
export const REACTION_STATES = new Set<AlyaState>([
  "greeting",
  "farewell",
  "excited",
  "surprised",
  "laughing",
  "satisfied",
  "proud",
  "playful",
  "shy",
  "embarrassed",
  "sad",
  "angry",
  "confused",
  "curious",
  "happy",
]);

// States that loop continuously (no auto-return)
export const LOOPING_STATES = new Set<AlyaState>([
  "idle",
  "calm",
  "listening",
  "thinking",
  "processing",
  "speaking",
]);

// Cooldown (ms) before the same clip can be shown again
export const CLIP_COOLDOWN_MS = 25_000;

// How many seconds from the end of a clip to start fading to the next
export const CROSSFADE_LEAD_S = 1.6;
