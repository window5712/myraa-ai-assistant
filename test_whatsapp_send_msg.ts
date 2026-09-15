import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function testWhatsAppSendMsg() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("COMPOSIO_API_KEY missing!");
    return;
  }

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  console.log("=== Testing WhatsApp Message Execution ===");
  try {
    const session = await composio.create(entityId);
    console.log("Session ID:", session.sessionId || session.id);

    console.log("\n--- 1. Ensuring Connection ---");
    const manageRes = await session.execute("COMPOSIO_MANAGE_CONNECTIONS", {
      toolkits: ["whatsapp"],
    });

    const status = manageRes?.data?.results?.whatsapp?.status;
    console.log("Connection Status:", status);

    if (status === "initiated" && manageRes?.data?.results?.whatsapp?.redirect_url) {
      console.log("\n👉 Please complete browser auth first:", manageRes.data.results.whatsapp.redirect_url);
      return;
    }

    console.log("\n--- 2. Fetching Phone Numbers ---");
    try {
      const getNumRes = await session.execute("WHATSAPP_GET_PHONE_NUMBERS", {});
      console.log("WHATSAPP_GET_PHONE_NUMBERS Result:\n", JSON.stringify(getNumRes, null, 2));
    } catch (e: any) {
      console.error("Error fetching phone numbers:", e.message || e);
    }

  } catch (err: any) {
    console.error("Fatal Error:", err);
  }
}

testWhatsAppSendMsg();
