/**
 * ProactiveEngine — Real-time proactive conversation state machine for Alya.
 *
 * Runs server-side (Node.js) per WebSocket session.
 * Prioritizes active TASK_EXECUTING over proactive conversation.
 * Pauses proactive questioning while any task, tool, browser, or terminal command is running.
 *
 * States:
 *   ACTIVE_CONVERSATION | WAITING_FOR_USER | THINKING | PROACTIVE_QUESTION |
 *   USER_IGNORING | SILENT | STOPPED | TASK_EXECUTING | TASK_WAITING |
 *   TASK_COMPLETED | TASK_FAILED
 */

export type ProactiveState =
  | "ACTIVE_CONVERSATION"  // User or agent is actively communicating
  | "WAITING_FOR_USER"     // Agent spoke; counting down inactivity
  | "THINKING"             // Generating a proactive question
  | "PROACTIVE_QUESTION"   // Question sent; waiting for user reply
  | "USER_IGNORING"        // User ignored 1–2 questions; may try one more
  | "SILENT"               // Auto-silenced after 3 ignored questions (sad state)
  | "STOPPED"              // Explicit user stop command; stays STOPPED until explicit resume
  | "TASK_EXECUTING"       // Agent actively executing user task (proactive timers disabled)
  | "TASK_WAITING"         // Agent waiting for tool/user confirmation (proactive timers disabled)
  | "TASK_COMPLETED"       // Task finished successfully (saving result & evaluating follow-up)
  | "TASK_FAILED";         // Task execution failed (saving error & attempting retry)

export interface ProactiveContext {
  activeTasks: any[];
  activeProjects: any[];
  dueReminders: any[];
  recentQA: any[];
  memories: any[];
  goals: any[];
  recentDialogue: { role: string; text: string }[];
}

export interface QuestionRecord {
  question: string;
  askedAt: string;
  answered: boolean;
  answer?: string;
  category: string;
}

interface ProactiveEngineOptions {
  /** Gemini API key for REST-based question generation */
  apiKey: string;
  /** Called with the generated question to deliver it to the user */
  onDeliver: (question: string) => void;
  /** Called whenever the conversation state changes */
  onStateChange?: (state: ProactiveState) => void;
  /** Optional logger override */
  onLog?: (msg: string) => void;
  /** Loads current memory/task/project context */
  getContext: () => Promise<ProactiveContext>;
}

// ─── Stop / Resume Pattern Matchers ──────────────────────────────────────────

const STOP_PATTERNS: RegExp[] = [
  /\bstop\b/i,
  /shut\s*up/i,
  /be\s*quiet/i,
  /^quiet\.?$/i,
  /hush\b/i,
  /silence\b/i,
  /khamosh\b/i,
  /khamosh\s*ho\s*jao/i,
  /bas\s*karo/i,
  /^bas\.?$/i,
  /don'?t\s*(ask|talk|speak|say)\b/i,
  /dont\s*(ask|talk|speak|say)\b/i,
  /no\s*more\s*(questions?|talking|asking)\b/i,
  /bot\s*stop\b/i,
  /please\s*stop\b/i,
  /stop\s*(talking|asking|speaking|saying|proactive)\b/i,
  /don'?t\s*interrupt/i,
  /pause\b/i,

  // Urdu & Roman Urdu stop patterns
  /abhi\s*mat\s*bol[oa]/i,
  /tum\s*mat\s*bol[oa]/i,
  /mat\s*bol[oa]/i,
  /kuch\s*mat\s*bol[oa]/i,
  /mat\s*pooch[ao]/i,
  /tum\s*mat\s*pooch[ao]/i,
  /chup\s*(ho\s*jao|raho|kar|karo)?/i,
  /^chup$/i,
];

const RESUME_PATTERNS: RegExp[] = [
  /\bresume\b/i,
  /\bcontinue\b/i,
  /start\s*again\b/i,
  /go\s*ahead\b/i,
  /you\s*can\s*(talk|speak|ask|chat)\b/i,
  /i'?m\s*(here|back|ready|listening)\b/i,
  /talk\s*to\s*me\b/i,
  /keep\s*going\b/i,
  /speak\s*again\b/i,

  // Urdu & Roman Urdu resume patterns
  /dobara\s*bol[oa]/i,
  /baat\s*karo/i,
  /phir\s*se\s*bol[oa]/i,
  /bolna\s*shuru\s*karo/i,
];

// Fallback questions pool — expanded & dynamically rotated so questions NEVER repeat
const FALLBACK_CASUAL_QUESTIONS = [
  "Hey! How is your project coming along today?",
  "What specific task would you like us to focus on next?",
  "By the way, did you get a chance to take a short break?",
  "Anything interesting you'd like to brainstorm together?",
  "How are things running on your side right now?",
  "So, what are we building or testing next?",
  "Need a quick hand reviewing anything on your screen?",
  "How is your energy feeling today?",
  "Are we ready to tackle the next step on your list?",
  "Just checking in — how is everything going?",
  "Would you like me to look up any info or documentation?",
  "What's the main goal we want to accomplish right now?"
];

// ─── Main Engine Class ────────────────────────────────────────────────────────

export class ProactiveEngine {
  // ── State ──────────────────────────────────────────────────────────────────
  private state: ProactiveState = "ACTIVE_CONVERSATION";
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private questionHistory: QuestionRecord[] = [];
  private consecutiveIgnored = 0;
  private lastUserActivityAt = Date.now();
  private lastAgentSpokeAt = 0;
  private isAgentCurrentlySpeaking = false;
  private pendingQuestion: string | null = null;
  private waitingForResponseSince: number | null = null;
  private isDestroyed = false;

  // ── Timing Configuration ───────────────────────────────────────────────────
  /** Minimum inactivity before evaluation (10 seconds) */
  private readonly MIN_INACTIVITY_MS = 10_000;
  /** Maximum inactivity before evaluation (15 seconds) */
  private readonly MAX_INACTIVITY_MS = 15_000;
  /** How long to wait for user reply before counting as ignored (20 seconds) */
  private readonly RESPONSE_WAIT_MS = 20_000;
  /** Max consecutive ignored proactive questions before entering SILENT (3 attempts) */
  private readonly MAX_CONSECUTIVE_IGNORED = 3;
  /** Minimum user activity age before we consider them "inactive" (5 seconds) */
  private readonly ACTIVITY_RECENCY_THRESHOLD_MS = 5_000;
  /** Minimum cool-down between proactive questions (10 seconds) */
  private readonly MIN_QUESTION_COOLDOWN_MS = 10_000;

  // ── Dependencies ───────────────────────────────────────────────────────────
  private readonly apiKey: string;
  private readonly onDeliver: (question: string) => void;
  private readonly onStateChange?: (state: ProactiveState) => void;
  private readonly log: (msg: string) => void;
  private readonly getContext: () => Promise<ProactiveContext>;

  /** Timestamp of last delivered proactive question */
  private lastDeliveredAt = 0;

  constructor(options: ProactiveEngineOptions) {
    this.apiKey = options.apiKey;
    this.onDeliver = options.onDeliver;
    this.onStateChange = options.onStateChange;
    this.log = options.onLog ?? console.log;
    this.getContext = options.getContext;
    this.startInactivityTimer();
    this.log("[Proactive] Engine initialized — monitoring for 10-15s user inactivity.");
  }

  // ─── Task Priority State Management ─────────────────────────────────────────

  /**
   * Set explicit task execution state.
   * Disables proactive timers while tasks, tools, or commands are running.
   */
  public setTaskState(
    newState: "TASK_EXECUTING" | "TASK_WAITING" | "TASK_COMPLETED" | "TASK_FAILED",
    details?: { taskName?: string; result?: any; error?: string }
  ): void {
    if (this.isDestroyed) return;

    if (newState === "TASK_EXECUTING") {
      this.clearInactivityTimer();
      this.enterState("TASK_EXECUTING");
      this.log(`[State: TASK_EXECUTING] Task execution priority active: "${details?.taskName || 'Processing task'}". Proactive questions disabled.`);
      return;
    }

    if (newState === "TASK_WAITING") {
      this.clearInactivityTimer();
      this.enterState("TASK_WAITING");
      this.log(`[State: TASK_WAITING] Waiting for tool/confirmation: "${details?.taskName || 'Task'}". Proactive questions disabled.`);
      return;
    }

    if (newState === "TASK_COMPLETED") {
      this.enterState("TASK_COMPLETED");
      this.log(`[State: TASK_COMPLETED] Task completed: "${details?.taskName || 'Task'}". Result saved. Resetting inactivity timer.`);
      this.enterState("WAITING_FOR_USER");
      this.resetInactivityTimer();
      return;
    }

    if (newState === "TASK_FAILED") {
      this.enterState("TASK_FAILED");
      this.log(`[State: TASK_FAILED] Task failed: "${details?.taskName || 'Task'}". Error: ${details?.error || 'Unknown error'}. Failure saved for retry.`);
      // Do not enter casual conversation — stay focused on task retry/recovery
      return;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call whenever genuine user interaction occurs (typing, clicking, spoken input).
   * Resets the inactivity countdown unless engine is explicitly STOPPED or TASK_EXECUTING.
   */
  public onUserActivity(): void {
    if (
      this.state === "STOPPED" ||
      this.state === "TASK_EXECUTING" ||
      this.state === "TASK_WAITING"
    ) return;

    this.lastUserActivityAt = Date.now();
    if (
      this.state === "WAITING_FOR_USER" ||
      this.state === "ACTIVE_CONVERSATION"
    ) {
      this.resetInactivityTimer();
    }
  }

  /**
   * Call when a user text or spoken transcription is received.
   * Handles stop/resume detection and marks proactive questions as answered.
   */
  public onUserMessage(text: string): void {
    if (!text || !text.trim()) return;

    const trimmed = text.trim();

    // Ignore system-injected proactive triggers
    if (trimmed.includes("[PROACTIVE_TRIGGER]")) {
      return;
    }

    this.lastUserActivityAt = Date.now();

    // ── Stop command detection ──────────────────────────────────────────────
    if (STOP_PATTERNS.some((p) => p.test(trimmed))) {
      this.log("[Proactive] STOP command detected — immediately stopping proactive speaking and cancelling timers.");
      this.clearInactivityTimer();
      this.pendingQuestion = null;
      this.waitingForResponseSince = null;
      this.enterState("STOPPED");
      return;
    }

    // ── Resume command detection ────────────────────────────────────────────
    if (
      RESUME_PATTERNS.some((p) => p.test(trimmed)) &&
      (this.state === "STOPPED" || this.state === "SILENT")
    ) {
      this.log("[Proactive] RESUME command detected — reactivating engine.");
      this.consecutiveIgnored = 0;
      this.pendingQuestion = null;
      this.waitingForResponseSince = null;
      this.enterState("ACTIVE_CONVERSATION");
      this.resetInactivityTimer();
      return;
    }

    // ── If engine is STOPPED and user sends a new message, un-stop and answer normally first ──
    if (this.state === "STOPPED") {
      this.log("[Proactive] New user message received while STOPPED — un-stopping engine, answering normally first.");
      this.consecutiveIgnored = 0;
      this.pendingQuestion = null;
      this.waitingForResponseSince = null;
      this.enterState("ACTIVE_CONVERSATION");
      this.resetInactivityTimer();
    }

    // ── If engine is SILENT (from 3 ignored attempts), a user message reactivates engine ──
    if (this.state === "SILENT") {
      this.log("[Proactive] User spoke while SILENT — resuming active engine.");
      this.consecutiveIgnored = 0;
      this.pendingQuestion = null;
      this.waitingForResponseSince = null;
      this.enterState("ACTIVE_CONVERSATION");
      this.resetInactivityTimer();
      return;
    }

    // ── User responded to a proactive question ──────────────────────────────
    if (
      this.state === "PROACTIVE_QUESTION" ||
      this.state === "USER_IGNORING"
    ) {
      this.log("[Proactive] User responded to proactive question — resetting to ACTIVE_CONVERSATION.");
      this.consecutiveIgnored = 0;

      if (this.pendingQuestion) {
        const record = this.questionHistory.find(
          (q) => q.question === this.pendingQuestion && !q.answered
        );
        if (record) {
          record.answered = true;
          record.answer = trimmed.slice(0, 300);
        }
      }

      this.pendingQuestion = null;
      this.waitingForResponseSince = null;
      this.enterState("ACTIVE_CONVERSATION");
      this.resetInactivityTimer();
      return;
    }

    // ── Normal flow ─────────────────────────────────────────────────────────
    if (this.state !== "TASK_EXECUTING" && this.state !== "TASK_WAITING") {
      this.enterState("ACTIVE_CONVERSATION");
      this.resetInactivityTimer();
    }
  }

  /**
   * Call when the agent starts producing audio/speech.
   * Prevents proactive interruptions while agent is talking.
   */
  public onAgentSpeaking(): void {
    if (!this.isAgentCurrentlySpeaking) {
      this.isAgentCurrentlySpeaking = true;
      this.lastAgentSpokeAt = Date.now();
      // Pause the inactivity timer while agent speaks
      this.clearInactivityTimer();
    }
  }

  /**
   * Call when the agent's turn is complete (finished speaking).
   * Restarts the inactivity timer to watch for user silence.
   */
  public onAgentFinishedSpeaking(): void {
    this.isAgentCurrentlySpeaking = false;
    this.lastAgentSpokeAt = Date.now();

    if (
      this.state === "STOPPED" ||
      this.state === "SILENT" ||
      this.state === "TASK_EXECUTING" ||
      this.state === "TASK_WAITING"
    ) return;

    // If we just finished delivering a proactive question, stay in PROACTIVE_QUESTION
    if (this.state !== "PROACTIVE_QUESTION") {
      this.enterState("WAITING_FOR_USER");
    }
    this.resetInactivityTimer();
  }

  /**
   * Immediately shut down the engine and clear all timers.
   * Call when the WebSocket session closes.
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.clearInactivityTimer();
    this.log("[Proactive] Engine destroyed.");
  }

  /** Returns the current state */
  public getState(): ProactiveState {
    return this.state;
  }

  // ─── Internal State Machine ──────────────────────────────────────────────────

  private enterState(newState: ProactiveState): void {
    if (this.state === newState) return;
    this.log(`[Proactive] State transition: ${this.state} → ${newState}`);
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private startInactivityTimer(): void {
    this.clearInactivityTimer();
    if (this.isDestroyed) return;
    if (
      this.state === "STOPPED" ||
      this.state === "SILENT" ||
      this.state === "TASK_EXECUTING" ||
      this.state === "TASK_WAITING"
    ) return;

    // Random delay between 10s and 15s for natural timing
    const delay =
      this.MIN_INACTIVITY_MS +
      Math.random() * (this.MAX_INACTIVITY_MS - this.MIN_INACTIVITY_MS);

    this.inactivityTimer = setTimeout(() => {
      this.onInactivityTimerFired();
    }, Math.round(delay));
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    this.startInactivityTimer();
  }

  // ─── Timer Handler ────────────────────────────────────────────────────────────

  private async onInactivityTimerFired(): Promise<void> {
    if (this.isDestroyed) return;

    // ── Gate Check 1: Task executing or waiting ────────────────────────────
    if (this.state === "TASK_EXECUTING" || this.state === "TASK_WAITING") {
      this.log("[Proactive] Timer fired during TASK_EXECUTING/WAITING — deferring.");
      return;
    }

    // ── Gate Check 2: Agent is currently speaking ──────────────────────────
    if (this.isAgentCurrentlySpeaking) {
      this.startInactivityTimer();
      return;
    }

    // ── Gate Check 3: Engine explicitly stopped ────────────────────────────
    if (this.state === "STOPPED") {
      return;
    }

    // ── Gate Check 4: Auto-silenced ────────────────────────────────────────
    if (this.state === "SILENT") {
      return;
    }

    // ── Gate Check 5: Still waiting for reply to proactive question ─────────
    if (this.state === "PROACTIVE_QUESTION") {
      const elapsed = this.waitingForResponseSince
        ? Date.now() - this.waitingForResponseSince
        : Infinity;

      if (elapsed < this.RESPONSE_WAIT_MS) {
        // Still within 20s response wait window; recheck in 5 seconds
        this.clearInactivityTimer();
        this.inactivityTimer = setTimeout(
          () => this.onInactivityTimerFired(),
          5_000
        );
        return;
      }

      // User ignored the question
      this.consecutiveIgnored++;
      this.log(
        `[Proactive] Question ignored by user (Attempt ${this.consecutiveIgnored}/${this.MAX_CONSECUTIVE_IGNORED})`
      );

      if (this.consecutiveIgnored >= this.MAX_CONSECUTIVE_IGNORED) {
        this.log(
          "[Proactive] Max ignored threshold (3 attempts) reached — entering SILENT state (Sad emotion)."
        );
        this.enterState("SILENT");
        return;
      }

      this.enterState("USER_IGNORING");
    }

    // ── Gate Check 6: User was active very recently ────────────────────────
    const timeSinceActivity = Date.now() - this.lastUserActivityAt;
    if (timeSinceActivity < this.ACTIVITY_RECENCY_THRESHOLD_MS) {
      this.startInactivityTimer();
      return;
    }

    // ── Gate Check 7: Cooldown check ──────────────────────────────────────
    if (
      this.lastDeliveredAt > 0 &&
      Date.now() - this.lastDeliveredAt < this.MIN_QUESTION_COOLDOWN_MS
    ) {
      this.startInactivityTimer();
      return;
    }

    // ── Gate Check 8: Max ignores in USER_IGNORING state ───────────────────
    if (this.state === "USER_IGNORING" && this.consecutiveIgnored >= 3) {
      this.log("[Proactive] 3 attempts ignored — entering SILENT state.");
      this.enterState("SILENT");
      return;
    }

    // All checks passed! Log IDLE_DETECTED and execute proactive cycle.
    this.log(`[IDLE_DETECTED] User idle for ${Math.round(timeSinceActivity / 1000)}s (threshold 10-15s).`);
    await this.evaluateAndAsk();
  }

  // ─── Task Follow-Up Evaluator ────────────────────────────────────────────────

  private async evaluateTaskFollowup(taskName: string, result?: any): Promise<void> {
    try {
      this.log(`[Task Follow-up] Evaluating relevant follow-up question for completed task: "${taskName}"...`);
      const ctx = await this.getContext();
      const prompt = `You are Alya. You just completed the following task for Aryan: "${taskName}".
Result/Summary: ${JSON.stringify(result || "Task finished successfully")}.

INSTRUCTIONS:
1. Is there a short, natural follow-up question that is DIRECTLY RELEVANT to this completed task?
2. If YES, generate a short, natural follow-up question under 15 words (e.g., "Would you like me to test that connection now?" or "Shall I save this summary for you?").
3. If NO, reply with SKIP.
4. Return ONLY the question or SKIP.`;

      const candidates = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.5-flash"];
      let followUpQ: string | null = null;

      for (const m of candidates) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${this.apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 50 },
              }),
            }
          );
          if (!resp.ok) continue;
          const data = (await resp.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text && !text.toUpperCase().includes("SKIP")) {
            followUpQ = text.replace(/^["'`]|["'`]$/g, "").trim();
            break;
          }
        } catch (e) {}
      }

      if (followUpQ) {
        this.log(`[Task Follow-up] Relevant follow-up question generated: "${followUpQ}"`);
        this.deliverQuestion(followUpQ);
      } else {
        this.log("[Task Follow-up] No immediate task follow-up required. Entering WAITING_FOR_USER.");
        this.enterState("WAITING_FOR_USER");
        this.resetInactivityTimer();
      }
    } catch (err: any) {
      this.log(`[Task Follow-up] Error evaluating follow-up: ${err.message}`);
      this.enterState("WAITING_FOR_USER");
      this.resetInactivityTimer();
    }
  }

  // ─── Question Generation & Delivery ──────────────────────────────────────────

  private async evaluateAndAsk(): Promise<void> {
    if (this.isDestroyed) return;

    this.log("[PROACTIVE_TIMER_TRIGGERED] Proactive timer fired. Starting evaluation cycle.");
    this.enterState("THINKING");

    try {
      // Step 1: Memory Retrieval
      const ctx = await this.getContext();
      this.log(
        `[MEMORY_RETRIEVED] Retrieved context: ${ctx.memories?.length || 0} memories, ${ctx.activeTasks?.length || 0} tasks, ${ctx.activeProjects?.length || 0} projects, ${ctx.recentQA?.length || 0} QA pairs.`
      );

      // Step 2: Question Generation
      const question = await this.generateQuestion(ctx);

      if (!question || !this.qualityCheck(question)) {
        // Fallback to reasoning question
        const fallbackQ = this.getFallbackReasoningQuestion();
        this.log(`[QUESTION_GENERATED] Using unique fallback question: "${fallbackQ}"`);
        this.deliverQuestion(fallbackQ);
        return;
      }

      this.log(`[QUESTION_GENERATED] AI generated natural question: "${question}"`);
      this.deliverQuestion(question);

    } catch (err: any) {
      this.log(`[Proactive] Error during evaluation: ${err.message}`);
      const fallbackQ = this.getFallbackReasoningQuestion();
      this.deliverQuestion(fallbackQ);
    }
  }

  private deliverQuestion(question: string): void {
    this.pendingQuestion = question;
    this.waitingForResponseSince = Date.now();
    this.lastDeliveredAt = Date.now();

    this.questionHistory.push({
      question,
      askedAt: new Date().toISOString(),
      answered: false,
      category: this.categorizeQuestion(question),
    });

    if (this.questionHistory.length > 60) {
      this.questionHistory = this.questionHistory.slice(-60);
    }

    this.enterState("PROACTIVE_QUESTION");
    this.log(`[QUESTION_SENT] Delivering proactive question: "${question}"`);
    this.onDeliver(question);

    // Schedule check for response wait timeout
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(
      () => this.onInactivityTimerFired(),
      this.RESPONSE_WAIT_MS + 2_000
    );
  }

  private getFallbackReasoningQuestion(): string {
    const askedLower = this.questionHistory.map((q) => q.question.toLowerCase());
    const unused = FALLBACK_CASUAL_QUESTIONS.filter(
      (q) => !askedLower.includes(q.toLowerCase())
    );
    const pool = unused.length > 0 ? unused : FALLBACK_CASUAL_QUESTIONS;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  }

  // ─── AI Question Generator ────────────────────────────────────────────────────

  private async generateQuestion(ctx: ProactiveContext): Promise<string | null> {
    const recentlyAskedList = this.questionHistory
      .slice(-15)
      .map((q) => `"${q.question}"`)
      .join(", ");

    const isFollowUp =
      this.state === "USER_IGNORING" && this.pendingQuestion != null;

    // Build context summary
    const sections: string[] = [];

    const activeProjects = (ctx.activeProjects || []).filter(
      (p) => p.status === "active" || p.status === "idea"
    );
    if (activeProjects.length > 0) {
      sections.push(
        `Active projects: ${activeProjects
          .slice(0, 3)
          .map((p) => `"${p.name}" (${p.status}, next: ${p.nextAction || "??"})`)
          .join("; ")}`
      );
    }

    const inProgressTasks = (ctx.activeTasks || []).filter((t) =>
      ["in_progress", "planned", "queued"].includes(t.status)
    );
    if (inProgressTasks.length > 0) {
      sections.push(
        `Active tasks: ${inProgressTasks
          .slice(0, 3)
          .map((t) => `"${t.title}" [${t.status}]`)
          .join("; ")}`
      );
    }

    const dueReminders = (ctx.dueReminders || []).filter((r) => {
      const due = new Date(r.dueAt).getTime();
      const now = Date.now();
      return due > now - 3_600_000 && due < now + 7_200_000;
    });
    if (dueReminders.length > 0) {
      sections.push(
        `Upcoming reminders: ${dueReminders
          .slice(0, 2)
          .map((r) => `"${r.text}"`)
          .join("; ")}`
      );
    }

    const validQA = (ctx.recentQA || [])
      .filter((qa) => qa.stillValid !== false && qa.answer)
      .slice(-5);
    if (validQA.length > 0) {
      const qaSummary = validQA
        .map((qa) => `Q: "${qa.question}" → A: "${(qa.answer || "").slice(0, 80)}"`)
        .join(" | ");
      sections.push(`Previously learned: ${qaSummary}`);
    }

    const memories = (ctx.memories || []).slice(-6).map((m) => m.text);
    if (memories.length > 0) {
      sections.push(`User memories: ${memories.join("; ")}`);
    }

    const goals = (ctx.goals || []).filter((g) => g.status === "active");
    if (goals.length > 0) {
      sections.push(
        `Active goals: ${goals
          .slice(0, 2)
          .map((g) => `"${g.title}"`)
          .join("; ")}`
      );
    }

    const recentDialogue = (ctx.recentDialogue || []).slice(-6);
    if (recentDialogue.length > 0) {
      const dlg = recentDialogue
        .map((d) => `${d.role}: ${d.text.slice(0, 100)}`)
        .join("\n");
      sections.push(`Recent conversation:\n${dlg}`);
    }

    const prompt = `You are Alya, a warm, friendly AI companion having a voice conversation with Aryan.
The user has been quiet for 10–15 seconds. Generate ONE fresh, unique question to re-engage naturally.

${sections.length > 0 ? `CURRENT CONTEXT:\n${sections.join("\n\n")}` : "CURRENT CONTEXT: No specific tasks or projects active."}

${recentlyAskedList ? `PREVIOUSLY ASKED QUESTIONS (DO NOT repeat or closely paraphrase any of these):\n${recentlyAskedList}` : ""}

${isFollowUp && this.pendingQuestion ? `User didn't answer: "${this.pendingQuestion}". Ask a short, gentle alternative topic.` : ""}

INSTRUCTIONS:
1. Generate exactly ONE short, natural, conversational question.
2. Prioritize: (1) active tasks/projects, (2) upcoming reminders, (3) recent conversation follow-up, (4) casual curiosity.
3. Keep it under 20 words.
4. Sound spontaneous and warm — NOT robotic.
5. Return ONLY the question string — no quotes, no labels.`;

    const modelCandidates = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.5-flash"];

    for (const modelName of modelCandidates) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.95,
                maxOutputTokens: 80,
              },
            }),
          }
        );

        if (!response.ok) continue;

        const data = (await response.json()) as any;
        const raw: string | undefined =
          data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!raw) continue;

        const cleaned = raw
          .trim()
          .replace(/^["'`]|["'`]$/g, "")
          .trim();

        if (
          !cleaned ||
          cleaned.toUpperCase() === "SKIP" ||
          cleaned.toLowerCase().startsWith("skip")
        ) {
          continue;
        }

        return cleaned;
      } catch (err: any) {
        // Try next candidate
      }
    }

    return null;
  }

  // ─── Quality Filter ───────────────────────────────────────────────────────────

  private qualityCheck(question: string): boolean {
    if (!question || question.length < 5 || question.length > 300) return false;

    const lower = question.toLowerCase();

    // Exact duplicate check against all history
    const recentQuestions = this.questionHistory
      .slice(-20)
      .map((q) => q.question.toLowerCase());
    if (recentQuestions.includes(lower)) {
      return false;
    }

    // Robotic patterns
    const roboticPatterns = [
      /how may i (help|assist)/i,
      /is there anything i can/i,
      /do you need (any|my) (help|assistance)/i,
      /what can i (do|help)/i,
      /how can i assist/i,
      /\[proactive/i,
      /\[system/i,
    ];
    if (roboticPatterns.some((p) => p.test(question))) {
      return false;
    }

    return true;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private categorizeQuestion(question: string): string {
    const lower = question.toLowerCase();
    if (/task|todo|finish|complete|done|working/.test(lower)) return "task";
    if (/project|build|develop|app|website|code/.test(lower)) return "project";
    if (/remind|deadline|due|schedule|appointment/.test(lower)) return "reminder";
    if (/goal|progress|milestone|achiev/.test(lower)) return "goal";
    if (/how are|feeling|doing|going/.test(lower)) return "casual";
    return "general";
  }
}
