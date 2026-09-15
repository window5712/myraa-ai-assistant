import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function testSession() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  console.log("=== 1. Checking connected accounts ===");
  const connList = await composio.connectedAccounts.list({ userUuid: entityId });
  const items = connList?.items || connList?.data || (Array.isArray(connList) ? connList : []);
  console.log("Connected accounts count:", items.length);
  
  const activeWhatsapp = items.find((i: any) => 
    (i.appName || i.toolkit?.slug || i.slug || "").toLowerCase() === "whatsapp" && i.status === "ACTIVE"
  );

  console.log("Active WhatsApp Account:", activeWhatsapp ? JSON.stringify(activeWhatsapp, null, 2) : "NONE");

  console.log("\n=== 2. Creating session with entityId / userUuid ===");
  // Try different session creation options
  try {
    const session = await composio.create(entityId);
    console.log("Session ID:", session.sessionId || session.id);

    console.log("\n--- Testing COMPOSIO_MANAGE_CONNECTIONS in session ---");
    const manageRes = await session.execute("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: ["whatsapp"] });
    console.log("COMPOSIO_MANAGE_CONNECTIONS result:\n", JSON.stringify(manageRes, null, 2));

    console.log("\n--- Testing WHATSAPP_GET_PHONE_NUMBERS after manage connections ---");
    try {
      const getNumRes = await session.execute("WHATSAPP_GET_PHONE_NUMBERS", {});
      console.log("WHATSAPP_GET_PHONE_NUMBERS result:\n", JSON.stringify(getNumRes, null, 2));
    } catch (e: any) {
      console.error("Error executing WHATSAPP_GET_PHONE_NUMBERS:", e.message);
    }
  } catch (err: any) {
    console.error("Session error:", err.message);
  }
}

testSession();
