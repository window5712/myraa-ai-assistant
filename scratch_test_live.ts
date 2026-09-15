import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const apiKey = process.env.GEMINI_API_KEY;
console.log("Testing with API Key:", apiKey ? `${apiKey.substring(0, 8)}...` : "NONE");

async function testLive() {
  const ai = new GoogleGenAI({
    apiKey: apiKey!,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const modelsToTest = [
    "gemini-3.1-flash-live-preview",
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-realtime-exp"
  ];

  for (const model of modelsToTest) {
    console.log(`\nTesting model: ${model}...`);
    try {
      const session = await ai.live.connect({
        model: model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
          systemInstruction: "You are a helpful assistant.",
        },
        callbacks: {
          onmessage: (msg) => {
            console.log(`[${model}] Message received:`, Object.keys(msg));
          },
          onclose: () => console.log(`[${model}] Closed`),
        }
      });
      console.log(`SUCCESS connected to ${model}!`);
      session.close();
      break;
    } catch (err: any) {
      console.error(`FAILED connected to ${model}:`, err.message || err);
    }
  }
}

testLive().then(() => process.exit(0)).catch(() => process.exit(1));
