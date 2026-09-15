import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function debug() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const composio = new Composio({ apiKey }) as any;

  try {
    console.log("\n=== Checking Session and Tools for Facebook ===");
    const session = await composio.create("aryan");
    
    // Search tools for Facebook
    const searchRes = await session.execute("COMPOSIO_SEARCH_TOOLS", { query: "facebook" });
    console.log("\n--- Facebook Search Tools Result ---");
    console.log(JSON.stringify(searchRes, null, 2));

    // Get connected account details for Facebook
    const res = await composio.connectedAccounts.list({ userUuid: "aryan" });
    const items = res?.items || res?.data || (Array.isArray(res) ? res : []);
    const fbConn = items.find((i: any) => (i.appName || i.toolkit?.slug || "").toLowerCase().includes("facebook"));
    console.log("\n--- Facebook Connection Item ---");
    console.log(JSON.stringify(fbConn, null, 2));

  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

debug();
