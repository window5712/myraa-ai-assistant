import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function getConnectLink() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("COMPOSIO_API_KEY missing in environment!");
    return;
  }

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  console.log("=== Generating WhatsApp Connect Link ===");
  try {
    const session = await composio.create(entityId);
    console.log("Session ID:", session.sessionId || session.id);

    // Call COMPOSIO_MANAGE_CONNECTIONS
    if (typeof session.execute === "function") {
      const res = await session.execute("COMPOSIO_MANAGE_CONNECTIONS", {
        toolkits: ["whatsapp"],
      });
      console.log("\nCOMPOSIO_MANAGE_CONNECTIONS Result:\n", JSON.stringify(res, null, 2));
    }
  } catch (err: any) {
    console.error("Error generating connect link:", err.message || err);
  }
}

getConnectLink();
