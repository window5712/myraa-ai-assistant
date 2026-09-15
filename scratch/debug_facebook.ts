import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";

async function checkFacebookTools() {
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log("==================================================================");
  console.log("             Facebook Tools & Schema Discovery Test               ");
  console.log("==================================================================");
  console.log("Target User:", userId);

  console.log("\nSearching Facebook post tools in Composio session...");
  const searchRes = await sessionManager.searchToolsInSession(userId, "Facebook create post publish page");
  console.log("\nDiscovered Tool Slugs:");
  console.log("Primary:", searchRes?.primaryToolSlugs || []);
  console.log("Related:", searchRes?.relatedToolSlugs || []);

  const toolsToInspect = searchRes?.primaryToolSlugs || [];
  if (toolsToInspect.length > 0) {
    console.log("\nFetching parameter schemas for discovered Facebook tools...");
    const schemas = await sessionManager.executeTool("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: toolsToInspect }, userId, true);
    console.log("\nFacebook Tool Schemas:\n", JSON.stringify(schemas.data, null, 2));
  } else {
    console.log("\nNo specific Facebook tool slugs returned from session search.");
  }
}

checkFacebookTools().catch((err) => {
  console.error("DEBUG SCRIPT ERROR:", err.message);
  process.exit(1);
});
