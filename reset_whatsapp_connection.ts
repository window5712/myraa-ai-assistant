import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function resetWhatsAppAll() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;

  console.log("=== Deleting ALL WhatsApp Connected Accounts in Workspace ===");
  try {
    const list = await composio.connectedAccounts.list({});
    const items = list?.items || list?.data || (Array.isArray(list) ? list : []);
    
    const whatsappConns = items.filter((i: any) => 
      (i.appName || i.toolkit?.slug || i.slug || "").toLowerCase().includes("whatsapp")
    );

    console.log(`Found ${whatsappConns.length} WhatsApp connection(s) total:`);
    for (const conn of whatsappConns) {
      console.log(`- Deleting ${conn.id} (Status: ${conn.status})...`);
      try {
        await composio.connectedAccounts.delete(conn.id);
        console.log(`✅ Successfully deleted ${conn.id}`);
      } catch (e: any) {
        console.error(`❌ Failed to delete ${conn.id}:`, e.message || e);
      }
    }

    console.log("\n=== Initiating Fresh Connection Link ===");
    const entityId = "aryan";
    const session = await composio.create(entityId);
    const manageRes = await session.execute("COMPOSIO_MANAGE_CONNECTIONS", {
      toolkits: ["whatsapp"],
    });

    const whatsappResult = manageRes?.data?.results?.whatsapp;
    console.log("Status:", whatsappResult?.status);
    if (whatsappResult?.redirect_url) {
      console.log("\n👉 NEW AUTH LINK:", whatsappResult.redirect_url);
    } else {
      console.log("Full Result:\n", JSON.stringify(manageRes, null, 2));
    }

  } catch (err: any) {
    console.error("Error during reset:", err.message || err);
  }
}

resetWhatsAppAll();
