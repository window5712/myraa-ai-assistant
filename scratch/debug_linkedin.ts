import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";

async function checkLinkedInTools() {
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log("==================================================================");
  console.log("             LinkedIn Tools & Schema Discovery Test               ");
  console.log("==================================================================");
  console.log("Target User:", userId);

  // 1. Check raw connected accounts for LinkedIn
  const rawAccounts = await sessionManager.getRawConnectedAccounts(userId);
  const linkedinAccounts = rawAccounts.filter((a) => a.toolkitSlug.includes("linkedin"));

  console.log(`\nLinkedIn Connection Records (${linkedinAccounts.length}):`);
  for (const acc of linkedinAccounts) {
    console.log(`- Account ID: ${acc.id}, Status: ${acc.status} (Raw: ${acc.rawStatus})`);
  }

  // 2. Discover LinkedIn post tools
  console.log("\nSearching LinkedIn post tools in Composio session...");
  const searchRes = await sessionManager.searchToolsInSession(userId, "LinkedIn create post share content");
  console.log("\nDiscovered Tool Slugs:");
  console.log("Primary:", searchRes?.primaryToolSlugs || []);
  console.log("Related:", searchRes?.relatedToolSlugs || []);

  const toolsToInspect = searchRes?.primaryToolSlugs || [];
  if (toolsToInspect.length > 0) {
    console.log("\nFetching parameter schemas for discovered LinkedIn tools...");
    const schemas = await sessionManager.executeTool("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: toolsToInspect }, userId, true);
    console.log("\nLinkedIn Tool Schemas:\n", JSON.stringify(schemas.data, null, 2));
  } else {
    console.log("\nNo specific LinkedIn tool slugs returned from session search.");
  }
}

checkLinkedInTools().catch((err) => {
  console.error("DEBUG SCRIPT ERROR:", err.message);
  process.exit(1);
});
