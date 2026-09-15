import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function testWhatsAppExecute() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  console.log("=== Testing Composio WhatsApp Action Execution ===");

  if (!apiKey) {
    console.error("COMPOSIO_API_KEY missing!");
    return;
  }

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  try {
    const session = await composio.create(entityId);
    console.log("Session ID:", session.sessionId || session.id);

    console.log("\n--- 1. Ensuring WhatsApp Toolkit Connection ---");
    const manageRes = await session.execute("COMPOSIO_MANAGE_CONNECTIONS", {
      toolkits: ["whatsapp"],
    });

    const connInfo = manageRes?.data?.results?.whatsapp;
    console.log("Connection Status:", connInfo?.status);

    if (connInfo?.status === "initiated" && connInfo?.redirect_url) {
      console.log("\n⚠️ Browser setup needed! Click link to authorize:");
      console.log("👉", connInfo.redirect_url);
      return;
    }

    console.log("\n--- 2. Fetching Phone Numbers (WHATSAPP_GET_PHONE_NUMBERS) ---");
    try {
      const getNumbersRes = await session.execute("WHATSAPP_GET_PHONE_NUMBERS", {});
      console.log("WHATSAPP_GET_PHONE_NUMBERS Result:\n", JSON.stringify(getNumbersRes, null, 2));
    } catch (e: any) {
      console.error("Error calling WHATSAPP_GET_PHONE_NUMBERS:", e.message || e);
    }

  } catch (err: any) {
    console.error("Fatal Error during WhatsApp execution test:", err);
  }
}

testWhatsAppExecute();
