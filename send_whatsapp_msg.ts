import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function sendTestMessage() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("COMPOSIO_API_KEY missing!");
    return;
  }

  // Get recipient phone number from CLI argument or default
  const argNumber = process.argv[2];
  let recipientPhone = argNumber || "923169830930";
  // Clean phone number: remove +, -, spaces, leading 0
  recipientPhone = recipientPhone.replace(/[\s\-\+]/g, "");
  if (recipientPhone.startsWith("0")) {
    recipientPhone = "92" + recipientPhone.substring(1);
  }

  const phoneNumberId = "1264531053410953";

  console.log(`=== Sending WhatsApp Test Message to ${recipientPhone} ===`);
  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  try {
    const session = await composio.create(entityId);
    console.log("Session ID:", session.sessionId || session.id);

    console.log("\n--- 1. Ensuring Connection ---");
    await session.execute("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: ["whatsapp"] });

    console.log("\n--- 2. Sending WhatsApp Template Message ---");
    const templatePayload = {
      phone_number_id: phoneNumberId,
      to_number: recipientPhone,
      template_name: "hello_world",
      language_code: "en_US"
    };

    console.log("Payload:\n", JSON.stringify(templatePayload, null, 2));

    const sendRes = await session.execute("WHATSAPP_SEND_TEMPLATE_MESSAGE", templatePayload);
    console.log("WHATSAPP_SEND_TEMPLATE_MESSAGE Result:\n", JSON.stringify(sendRes, null, 2));

  } catch (err: any) {
    console.error("Fatal error:", err.message || err);
  }
}

sendTestMessage();
