import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function testWhatsAppMsg() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  try {
    const session = await composio.create(entityId);
    console.log("=== Testing WhatsApp Actions ===");

    await session.execute("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: ["whatsapp"] });

    // Search for all available whatsapp actions
    const searchRes = await session.execute("COMPOSIO_SEARCH_TOOLS", { query: "whatsapp" });
    console.log("Search Res:\n", JSON.stringify(searchRes, null, 2));

  } catch (err: any) {
    console.error("Error:", err.message || err);
  }
}

testWhatsAppMsg();
