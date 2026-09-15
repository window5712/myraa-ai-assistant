/**
 * Audio handling utility for Alya Live API Voice stream.
 * Handles:
 * - 16kHz layout sampling for microphone stream.
 * - Raw Little Endian Int16 PCM translation.
 * - 24kHz layout output sampling for model voice playback.
 * - Gapless double-buffer queue scheduler.
 * - Interrupt signal immediate stop.
 * - Input & Output AnalyserNodes for real-time waveform visuals.
 */

export type LiveState = "disconnected" | "connecting" | "listening" | "speaking";

// PCM Conversion Helper: converts Float32Array [-1.0, 1.0] to signed Int16 Raw PCM Little Endian
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

// Float conversion helper: converts signed Int16 array buffer to Float32Array [-1.0, 1.0]
function pcm16ToFloats(uint8Array: Uint8Array): Float32Array {
  const int16 = new Int16Array(
    uint8Array.buffer,
    uint8Array.byteOffset,
    uint8Array.byteLength / 2
  );
  const floats = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    floats[i] = int16[i] / 32768.0;
  }
  return floats;
}

// Convert ArrayBuffer to Base64 String
function base64ArrayBuffer(arrayBuffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert Base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class MyraaAudioSession {
  private ws: WebSocket | null = null;
  
  // Audios contexts (separate to match exact required sample rates)
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  
  // Audio sources & processors
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micProcessorNode: ScriptProcessorNode | null = null;
  
  // Visualisers
  public inputAnalyser: AnalyserNode | null = null;
  public outputAnalyser: AnalyserNode | null = null;
  private outputGainNode: GainNode | null = null;
  
  // Buffering / Playback details
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  // Anti-flicker: track whether we've received at least one audio chunk
  // in the current turn. Prevents the state from snapping back to "listening"
  // between audio chunks (which causes the choppy stop/start effect).
  private audioActiveInTurn = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SILENCE_THRESHOLD_MS = 1200;
  
  // State Callbacks
  private onStateChange: (state: LiveState) => void;
  private onTranscription: (role: "user" | "model", text: string) => void;
  private onToolCall: (name: string, args: any, callback: (result: any) => void) => void;
  private onError: (error: string) => void;
  private onMemorySync?: (memories: any[]) => void;
  private onAgentActivity?: (activity: any) => void;
  private onComposioConfirmation?: (data: any) => void;
  private onComposioConnectRequired?: (data: { action: string; appName: string; redirectUrl: string; message: string }) => void;
  private onLifeMemorySync?: (db: any) => void;
  private onReminderTriggered?: (reminder: any) => void;
  private onProactiveStateChange?: (state: string) => void;
  private onProactiveQuestionSent?: (question: string) => void;

  private currentState: LiveState = "disconnected";
  private isActivated = false;

  // Activity detection — throttled pings sent to server so the proactive
  // engine knows the user is active and should not interrupt unnecessarily.
  private _activityThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private _activityListener: (() => void) | null = null;

  constructor(handlers: {
    onStateChange: (state: LiveState) => void;
    onTranscription: (role: "user" | "model", text: string) => void;
    onToolCall: (name: string, args: any, callback: (result: any) => void) => void;
    onError: (error: string) => void;
    onMemorySync?: (memories: any[]) => void;
    onAgentActivity?: (activity: any) => void;
    onComposioConfirmation?: (data: any) => void;
    onComposioConnectRequired?: (data: { action: string; appName: string; redirectUrl: string; message: string }) => void;
    onLifeMemorySync?: (db: any) => void;
    onReminderTriggered?: (reminder: any) => void;
    onProactiveStateChange?: (state: string) => void;
    onProactiveQuestionSent?: (question: string) => void;
  }) {
    this.onStateChange = handlers.onStateChange;
    this.onTranscription = handlers.onTranscription;
    this.onToolCall = handlers.onToolCall;
    this.onError = handlers.onError;
    this.onMemorySync = handlers.onMemorySync;
    this.onAgentActivity = handlers.onAgentActivity;
    this.onComposioConfirmation = handlers.onComposioConfirmation;
    this.onComposioConnectRequired = handlers.onComposioConnectRequired;
    this.onLifeMemorySync = handlers.onLifeMemorySync;
    this.onReminderTriggered = handlers.onReminderTriggered;
    this.onProactiveStateChange = handlers.onProactiveStateChange;
    this.onProactiveQuestionSent = handlers.onProactiveQuestionSent;
  }

  public sendConfirmationResponse(callId: string, action: string, params: any, confirmed: boolean) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (confirmed) {
        // Trigger server execute endpoint or message
        fetch("/api/composio/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, params, confirmed: true }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(
                JSON.stringify({
                  type: "toolResponse",
                  id: callId,
                  name: "composioExecute",
                  output: result,
                })
              );
            }
          })
          .catch((err) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(
                JSON.stringify({
                  type: "toolResponse",
                  id: callId,
                  name: "composioExecute",
                  output: { success: false, error: err.message },
                })
              );
            }
          });
      } else {
        this.ws.send(
          JSON.stringify({
            type: "toolResponse",
            id: callId,
            name: "composioExecute",
            output: { success: false, error: "Action cancelled by user." },
          })
        );
      }
    }
  }

  private setState(state: LiveState) {
    this.currentState = state;
    this.onStateChange(state);
  }

  public getState(): LiveState {
    return this.currentState;
  }

  /**
   * Pushes a compressed JPEG base64 screenshot frame directly to the live WebSocket server.
   */
  public sendVideoFrame(base64Data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentState !== "disconnected") {
      this.ws.send(JSON.stringify({ type: "video", video: base64Data }));
    }
  }

  // Requests microphone and creates connections
  public async connect() {
    if (this.isActivated) return;
    this.isActivated = true;
    this.setState("connecting");

    try {
      // 1. Establish custom WebSocket server bridge
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      this.ws.binaryType = "blob";

      this.ws.onopen = async () => {
        console.log("[Alya] Connected to server side WS bridge");
        try {
          // Guard against early user disconnect during connection setup
          if (!this.isActivated) return;

          // Safe, cross-browser AudioContext initialization
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) {
            throw new Error("Holographic audio link unsupported: Web Audio API missing in browser.");
          }

          this.inputAudioCtx = new AudioContextClass({ sampleRate: 16000 });
          this.outputAudioCtx = new AudioContextClass({ sampleRate: 24000 });

          // Ensure Audio Contexts are active and resumed to bypass browser security blocks
          if (this.inputAudioCtx.state === "suspended") {
            await this.inputAudioCtx.resume().catch(() => {});
          }
          if (this.outputAudioCtx.state === "suspended") {
            await this.outputAudioCtx.resume().catch(() => {});
          }
          
          // Setup custom output Analyser & Volume Gains
          this.outputGainNode = this.outputAudioCtx.createGain();
          this.outputAnalyser = this.outputAudioCtx.createAnalyser();
          this.outputAnalyser.fftSize = 256;
          this.outputAnalyser.smoothingTimeConstant = 0.8;
          
          this.outputGainNode.connect(this.outputAnalyser);
          this.outputAnalyser.connect(this.outputAudioCtx.destination);
          
          // Obtain User Microphone layout
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          });

          // Safeguard: Check if we disconnected while waiting for user to grant mic permissions
          if (!this.isActivated || !this.inputAudioCtx || !this.outputAudioCtx) {
            stream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch (e) {}
            });
            return;
          }

          this.micStream = stream;

          // Setup custom input Analyser
          this.inputAnalyser = this.inputAudioCtx.createAnalyser();
          this.inputAnalyser.fftSize = 256;
          
          this.micSourceNode = this.inputAudioCtx.createMediaStreamSource(this.micStream);
          this.micSourceNode.connect(this.inputAnalyser);

          // Stream input PCM 16-bit to WS
          this.micProcessorNode = this.inputAudioCtx.createScriptProcessor(2048, 1, 1);
          this.micSourceNode.connect(this.micProcessorNode);
          this.micProcessorNode.connect(this.inputAudioCtx.destination);

          this.micProcessorNode.onaudioprocess = (e) => {
            if (this.currentState === "disconnected" || this.currentState === "connecting") return;
            
            const channelData = e.inputBuffer.getChannelData(0);
            
            // Convert to base64 Int16 Little Endian PCM
            const pcmBuffer = floatTo16BitPCM(channelData);
            const base64 = base64ArrayBuffer(pcmBuffer);
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ audio: base64 }));
            }
          };

          // Sound setups are fully functional
          this.setState("listening");

        } catch (audioError: any) {
          console.error("Audio Context or Microphone Initialization Failed:", audioError);
          this.onError(`Permission error: ${audioError.message || "Microphone required for holographic Live link."}`);
          this.disconnect();
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Root Error Handler message
          if (data.type === "error") {
            this.onError(data.error);
            this.disconnect();
            return;
          }

          // Handle server-side states
          if (data.type === "status") {
            console.log("[Alya WS Status]:", data.status);
            if (data.status === "connecting_gemini") {
              // Wait for Gemini Live connection
            } else if (data.status === "connected") {
              this.setState("listening");
            } else if (data.status === "session_closed") {
              this.disconnect();
            }
            return;
          }

          // Handle audio payload (24kHzPCM model response)
          if (data.type === "audio" && data.audio) {
            this.playAudioPCMChunk(data.audio);
          }

          // Handle interruption signal (e.g. user talked over Alya)
          if (data.type === "interrupted") {
            this.handleInterruption();
          }

          // Turn complete
          if (data.type === "turnComplete") {
            // Cancel any pending silence timer and mark turn as done.
            // The state will revert once all remaining audio buffers drain.
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
            this.scheduleSilenceCheck();
          }

          // Handle live captions transcription
          if (data.type === "transcription") {
            this.onTranscription(data.role, data.text);
          }

          // Handle memory synchronization
          if (data.type === "memory_sync" && data.memories) {
            if (this.onMemorySync) {
              this.onMemorySync(data.memories);
            }
          }

          // Handle agent activity updates
          if (data.type === "agent_activity" && this.onAgentActivity) {
            this.onAgentActivity(data);
          }

          // Handle sensitive action confirmation request
          if (data.type === "composioConfirmationRequired" && this.onComposioConfirmation) {
            this.onComposioConfirmation(data);
          }

          // Handle unconnected Composio app connect request
          if (data.type === "composioConnectRequired" && this.onComposioConnectRequired) {
            this.onComposioConnectRequired(data);
          }

          // Handle life memory sync
          if (data.type === "life_memory_sync" && data.db && this.onLifeMemorySync) {
            this.onLifeMemorySync(data.db);
          }

          // Handle reminder triggered
          if (data.type === "reminder_triggered" && data.reminder && this.onReminderTriggered) {
            this.onReminderTriggered(data.reminder);
          }

          // Handle proactive conversation state changes
          if (data.type === "proactive_state_change" && data.state) {
            if (this.onProactiveStateChange) {
              this.onProactiveStateChange(data.state);
            }
          }

          // Handle proactive question delivery notification
          if (data.type === "proactive_question_sent" && data.question) {
            if (this.onProactiveQuestionSent) {
              this.onProactiveQuestionSent(data.question);
            }
          }

          // Handle Tool Calling
          if (data.type === "toolCall") {
            const { callId, name, args } = data;
            this.onToolCall(name, args, (result) => {
              // Send back execution result to server bridge
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                  type: "toolResponse",
                  id: callId,
                  name: name,
                  output: result
                }));
              }
            });
          }

        } catch (parseError) {
          console.error("Error reading server packet:", parseError);
        }
      };

      this.ws.onerror = (wsError) => {
        console.error("WebSocket transport error:", wsError);
        this.onError("Holographic network link lost. Please check connection.");
        this.disconnect();
      };

      this.ws.onclose = () => {
        console.log("WebSocket connection closed");
        this.disconnect();
      };

      // ── Activity Detection ──────────────────────────────────────────────────
      // Send throttled user_activity pings so the server proactive engine knows
      // the user is present/active and should not interrupt unnecessarily.
      const sendActivityPing = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "user_activity" }));
        }
      };

      const throttledActivity = () => {
        if (this._activityThrottleTimer) return; // Already sent recently
        sendActivityPing();
        this._activityThrottleTimer = setTimeout(() => {
          this._activityThrottleTimer = null;
        }, 5_000); // Max one ping every 5 seconds
      };

      this._activityListener = throttledActivity;
      window.addEventListener("keydown", throttledActivity, { passive: true });
      window.addEventListener("click", throttledActivity, { passive: true });
      window.addEventListener("touchstart", throttledActivity, { passive: true });

    } catch (e: any) {
      console.error("Connection establish sequence failed:", e);
      this.onError(e.message || "Failed to initialize active channel.");
      this.disconnect();
    }
  }

  // Interruption triggers: stops all active audio players immediately
  private handleInterruption() {
    console.log("[Audio] Interruption signal received; flushing play logs.");
    
    // Stop all playing nodes
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (err) {
        // Already finished or stopped
      }
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    this.audioActiveInTurn = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // Set state back to user listening
    this.setState("listening");
  }

  // Direct raw PCM chunk scheduled playback at 24kHz
  private playAudioPCMChunk(base64Audio: string) {
    if (!this.outputAudioCtx || !this.outputGainNode) return;

    try {
      // Set speaking state only ONCE per turn (not on every chunk).
      if (!this.audioActiveInTurn) {
        this.audioActiveInTurn = true;
        this.setState("speaking");
      }

      // Reset the silence timer — as long as chunks keep arriving within the
      // threshold window, we stay in "speaking" and never flicker.
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      const uint8Array = base64ToUint8Array(base64Audio);
      const floats = pcm16ToFloats(uint8Array);

      // Create AudioBuffer of 24000Hz (the exact playback sample rate of Gemini outputs)
      const buffer = this.outputAudioCtx.createBuffer(1, floats.length, 24000);
      buffer.getChannelData(0).set(floats);

      // Create Buffer source
      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = buffer;

      // Connect source to gain which is routed to analyser & speakers
      source.connect(this.outputGainNode);

      const currentTime = this.outputAudioCtx.currentTime;

      // Gapless scheduler sync
      if (this.nextStartTime < currentTime) {
        // Start fresh: 80ms ahead to bridge schedule timing and network jitter
        this.nextStartTime = currentTime + 0.08;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;

      // Keep reference to handle real-time interruptions
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }

        // Only revert to listening when ALL buffers have played AND no new
        // chunk has arrived within the silence threshold (the timer handles that).
        if (this.activeSources.length === 0 && this.audioActiveInTurn) {
          this.scheduleSilenceCheck();
        }
      };

      this.activeSources.push(source);

    } catch (playbackError) {
      console.error("PCM Chunk buffering/playback failed:", playbackError);
    }
  }

  /**
   * After all currently-scheduled audio buffers have played, start a timer.
   * If no new audio chunk arrives before the timer fires, the turn is truly
   * over — revert to listening. If a chunk does arrive, the timer is cleared
   * (see playAudioPCMChunk) and speaking continues seamlessly.
   */
  private scheduleSilenceCheck() {
    if (this.silenceTimer) return; // already pending
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.audioActiveInTurn = false;
      if (this.currentState === "speaking") {
        this.setState("listening");
      }
    }, this.SILENCE_THRESHOLD_MS);
  }

  // Fully cleanup and release microphones & connection sockets
  public disconnect() {
    this.isActivated = false;
    this.setState("disconnected");

    // Remove activity detection listeners
    if (this._activityListener) {
      window.removeEventListener("keydown", this._activityListener);
      window.removeEventListener("click", this._activityListener);
      window.removeEventListener("touchstart", this._activityListener);
      this._activityListener = null;
    }
    if (this._activityThrottleTimer) {
      clearTimeout(this._activityThrottleTimer);
      this._activityThrottleTimer = null;
    }

    // Close WS socket
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    // Stop and release user microphone streams
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.micStream = null;
    }

    // Disconnect routing nodes
    if (this.micProcessorNode) {
      try {
        this.micProcessorNode.disconnect();
      } catch (e) {}
      this.micProcessorNode = null;
    }

    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {}
      this.micSourceNode = null;
    }

    // Close Audio contexts
    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close();
      } catch (e) {}
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      try {
        this.outputAudioCtx.close();
      } catch (e) {}
      this.outputAudioCtx = null;
    }

    this.activeSources = [];
    this.nextStartTime = 0;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.outputGainNode = null;
  }
}

export { MyraaAudioSession as AlyaAudioSession };

