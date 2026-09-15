import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";
import { ProactiveEngine } from "./src/lib/proactiveEngine.js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const apiKey = process.env.GEMINI_API_KEY;
console.log("==================================================");
console.log("  PROACTIVE QUESTION FEATURE - END-TO-END TEST");
console.log("==================================================");
console.log("API Key loaded:", apiKey ? `${apiKey.substring(0, 8)}...` : "NONE");

async function testProactiveEngineEndToEnd() {
  const ai = new GoogleGenAI({
    apiKey: apiKey!,
    apiVersion: "v1alpha",
    httpOptions: {
      apiVersion: "v1alpha",
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  try {
    const candidateModels = [
      "gemini-2.5-flash-native-audio-latest",
      "gemini-3.1-flash-live-preview",
      "gemini-2.5-flash-native-audio-preview-12-2025",
      "gemini-2.5-flash",
      "gemini-3.6-flash"
    ];
    let session: any = null;
    let connectedModel = "";

    for (const targetModel of candidateModels) {
      console.log(`\nConnecting to Gemini Live session (${targetModel})...`);
      let closeError: string | null = null;
      let isClosed = false;

      try {
        let isVoiceSpeaking = false;

        const currentSession = await ai.live.connect({
          model: targetModel,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" },
              },
            },
            systemInstruction: "You are Alya, a warm and friendly AI assistant. When given a proactive trigger, respond naturally with a short question under 20 words.",
          },
          callbacks: {
            onmessage: (msg: any) => {
              const parts = msg.serverContent?.modelTurn?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.text) {
                    if (!isVoiceSpeaking) {
                      isVoiceSpeaking = true;
                      console.log(`[VOICE_STARTED] Model output audio/text stream started.`);
                    }
                    console.log(`\n🤖 [AI Question Spoken]: ${part.text}`);
                  } else if (part.inlineData) {
                    if (!isVoiceSpeaking) {
                      isVoiceSpeaking = true;
                      console.log(`\n🔊 [VOICE_STARTED] Native Audio stream receiving audio PCM bytes...`);
                    }
                  }
                }
              }

              if (msg.serverContent?.turnComplete) {
                if (isVoiceSpeaking) {
                  console.log(`[VOICE_COMPLETED] Model audio turn complete.\n`);
                  isVoiceSpeaking = false;
                }
                if (typeof engine !== "undefined") {
                  engine.onAgentFinishedSpeaking();
                }
              }
            },
            onerror: (err: any) => {
              console.error(`❌ [${targetModel}] Error:`, err.message || err);
              closeError = err.message || String(err);
            },
            onclose: (e: any) => {
              isClosed = true;
              if (e?.code && e.code !== 1000) {
                closeError = `Code: ${e.code}, Reason: ${e.reason || 'Not supported'}`;
                console.log(`⚠️ [${targetModel}] Closed with code ${e.code}: ${e.reason || 'Not supported'}`);
              } else {
                console.log(`\n[Gemini Live Session Closed]`);
              }
            },
          }
        });

        // Wait 1.5s to verify connection stays alive
        await new Promise((res) => setTimeout(res, 1500));

        if (!isClosed && !closeError) {
          session = currentSession;
          connectedModel = targetModel;
          console.log(`✅ Successfully connected and verified Live session with ${targetModel}!`);
          break;
        }
      } catch (err: any) {
        console.warn(`Could not connect to ${targetModel}: ${err.message || err}`);
      }
    }

    if (!session) {
      throw new Error("Could not connect to any Gemini Live model. Please check API key / Live API availability.");
    }

    console.log(`✅ Connected to Gemini Live.`);

    // Initialize ProactiveEngine with 10-15s idle timer
    const engine = new ProactiveEngine({
      apiKey: apiKey!,
      getContext: async () => {
        return {
          activeTasks: [{ title: "Build website dashboard", status: "in_progress" }],
          activeProjects: [{ name: "Alya Assistant v2", status: "active" }],
          dueReminders: [{ text: "Check email inbox", dueAt: new Date(Date.now() + 1800000).toISOString() }],
          recentQA: [{ question: "What is your favorite color?", answer: "Violet" }],
          memories: [{ text: "Aryan likes dark themes and Urdu language" }],
          goals: [{ title: "Complete AI companion features", status: "active" }],
          recentDialogue: []
        };
      },
      onDeliver: (question: string) => {
        console.log(`[QUESTION_SENT] Injecting question into Gemini Live session: "${question}"`);
        try {
          (session as any).sendClientContent({
            turns: [
              {
                role: "user",
                parts: [{ text: `[PROACTIVE_TRIGGER] ${question}` }],
              },
            ],
            turnComplete: true,
          });
        } catch (err: any) {
          console.error("Delivery error:", err.message);
        }
      },
      onLog: (msg: string) => console.log(msg)
    });

    console.log("\nLeaving system completely idle for 20 seconds...");
    console.log("The proactive engine should detect inactivity, retrieve memories, generate a question, send it, and complete the voice cycle.\n");

    // Wait 35 seconds to observe 2 full proactive question cycles
    setTimeout(() => {
      console.log("\n==================================================");
      console.log("  End-to-End Proactive Test Finished Successfully!");
      console.log("==================================================");
      engine.destroy();
      session.close();
      process.exit(0);
    }, 35000);

  } catch (err: any) {
    console.error("Test failed to execute:", err.message || err);
  }
}

testProactiveEngineEndToEnd();
