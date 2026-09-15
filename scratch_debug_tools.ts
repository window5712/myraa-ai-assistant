import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function debugTools() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  try {
    const session = await composio.create(entityId);
    console.log("Session created:", session.id || session.sessionId);
    
    // Check methods on session and composio
    console.log("session keys:", Object.keys(session));
    if (session.tools) {
      console.log("session.tools keys:", Object.keys(session.tools));
    }

    // Try fetching tools for whatsapp
    if (typeof session.getTools === "function") {
      const tools = await session.getTools({ toolkits: ["whatsapp"] });
      console.log("session.getTools result count:", Array.isArray(tools) ? tools.length : typeof tools);
      console.log("Sample tool:", JSON.stringify(tools[0] || tools, null, 2));
    }

    if (composio.tools) {
      console.log("composio.tools keys:", Object.keys(composio.tools));
    }

  } catch (e: any) {
    console.error("Error debugging tools:", e.message);
  }
}

debugTools();
