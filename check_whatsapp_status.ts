import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function checkStatus() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("COMPOSIO_API_KEY missing!");
    return;
  }

  const composio = new Composio({ apiKey }) as any;
  const entityId = "aryan";

  console.log("=== Checking Connected Accounts for user 'aryan' ===");
  try {
    const connList = await composio.connectedAccounts.list({ userUuid: entityId });
    const items = connList?.items || connList?.data || (Array.isArray(connList) ? connList : []);
    console.log(`Found ${items.length} total connected accounts for '${entityId}'`);
    
    items.forEach((item: any, idx: number) => {
      console.log(`\n--- Account #${idx + 1} ---`);
      console.log("ID:", item.id);
      console.log("App/Toolkit:", item.appName || item.toolkit?.slug || item.slug);
      console.log("Status:", item.status);
      console.log("User UUID:", item.userUuid);
      console.log("Created At:", item.createdAt);
    });

  } catch (err: any) {
    console.error("Error checking status:", err.message || err);
  }
}

checkStatus();
