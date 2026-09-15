import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function listWhatsAppTools() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  try {
    const session = await composio.create(entityId);
    console.log("=== 1. Active Connection Check ===");
    await session.execute("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: ["whatsapp"] });

    console.log("\n=== 2. Searching WhatsApp Tools ===");
    const searchRes = await session.execute("COMPOSIO_SEARCH_TOOLS", { query: "whatsapp" });
    console.log("WhatsApp Tools List:\n", JSON.stringify(searchRes, null, 2));

  } catch (err: any) {
    console.error("Error listing tools:", err.message || err);
  }
}

listWhatsAppTools();
