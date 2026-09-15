import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function checkAllAccounts() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("COMPOSIO_API_KEY is missing");
    return;
  }

  const composio = new Composio({ apiKey }) as any;

  console.log("==========================================");
  console.log("Checking Connected Accounts across Entities");
  console.log("==========================================\n");

  const entities = ["aryan", "default"];

  for (const entityId of entities) {
    try {
      console.log(`--- Connected Accounts for Entity: "${entityId}" ---`);
      const connList = await composio.connectedAccounts.list({ userUuid: entityId });
      const items = connList?.items || connList?.data || (Array.isArray(connList) ? connList : []);
      
      console.log(`Total items found: ${items.length}`);
      
      items.forEach((item: any, idx: number) => {
        const slug = item.toolkit?.slug || item.appName || item.slug || "unknown";
        const status = item.status || "unknown";
        const accountId = item.id || item.connectedAccountId;
        console.log(` ${idx + 1}. [${slug.toUpperCase()}] Status: ${status} | ID: ${accountId}`);
      });
      console.log("");
    } catch (e: any) {
      console.error(`Error listing accounts for entity "${entityId}":`, e.message);
    }
  }
}

checkAllAccounts();
