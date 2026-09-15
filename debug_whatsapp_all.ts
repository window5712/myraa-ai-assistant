import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function debugAll() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;

  console.log("=== Listing ALL Connected Accounts in Project ===");
  try {
    const list = await composio.connectedAccounts.list({});
    const items = list?.items || list?.data || (Array.isArray(list) ? list : []);
    console.log(`Found ${items.length} total connected accounts in workspace:`);
    items.forEach((item: any, i: number) => {
      console.log(`\n[${i + 1}] ID: ${item.id}`);
      console.log(`    App/Toolkit: ${item.appName || item.toolkit?.slug}`);
      console.log(`    Status: ${item.status}`);
      console.log(`    User UUID: ${item.userUuid}`);
      console.log(`    Auth Config ID: ${item.authConfigId || item.authConfig?.id}`);
    });
  } catch (e: any) {
    console.error("Error listing accounts:", e.message || e);
  }
}

debugAll();
