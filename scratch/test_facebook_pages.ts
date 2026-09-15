import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";

async function fetchFacebookPages() {
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log("==================================================================");
  console.log("          Alya Facebook Page Auto-Discovery Test                  ");
  console.log("==================================================================");
  console.log("Target User:", userId);

  console.log("\nExecuting FACEBOOK_LIST_MANAGED_PAGES...");
  const result = await sessionManager.executeTool("FACEBOOK_LIST_MANAGED_PAGES", {}, userId, true);

  if (result.requiresConfirmation) {
    console.log("Confirmation required for action.");
    return;
  }

  if (result.redirectUrl) {
    console.log("\nFacebook connection expired or missing. Authorization link generated:");
    console.log(result.redirectUrl);
    return;
  }

  if (!result.success) {
    console.error("\nFailed fetching Facebook Pages:", result.error);
    return;
  }

  console.log("\nFACEBOOK PAGES RETURNED SUCCESSFULLY!");
  console.log("Raw Payload:", JSON.stringify(result.data, null, 2));

  const pages = result.items || result.data?.data || result.data?.pages || [];
  console.log(`\nDiscovered ${pages.length} Facebook Page(s):`);

  for (const page of pages) {
    console.log(`- Page Name: "${page.name || page.page_name}", Page ID: "${page.id || page.page_id}"`);
  }
}

fetchFacebookPages().catch((err) => {
  console.error("TEST FAILED:", err.message);
  process.exit(1);
});
