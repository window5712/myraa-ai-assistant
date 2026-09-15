import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const apiKey = process.env.GEMINI_API_KEY;

async function listAllModels() {
  console.log("Checking available models for API Key:", apiKey ? `${apiKey.substring(0, 8)}...` : "NONE");
  const ai = new GoogleGenAI({ apiKey: apiKey! });

  try {
    const modelsResponse = await ai.models.list();
    console.log("\nAvailable Models:");
    for await (const model of modelsResponse) {
      console.log(`- ID: ${model.name}`);
      console.log(`  DisplayName: ${model.displayName}`);
      console.log(`  SupportedActions: ${JSON.stringify((model as any).supportedGenerationMethods || (model as any).supportedMethods || [])}`);
    }
  } catch (err: any) {
    console.error("Failed to list models:", err.message || err);
  }
}

listAllModels();
