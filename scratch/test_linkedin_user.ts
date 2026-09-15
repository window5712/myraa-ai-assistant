import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";

async function fetchLinkedInUserInfo() {
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log("==================================================================");
  console.log("          Alya LinkedIn Profile & Author URN Test                 ");
  console.log("==================================================================");
  console.log("Target User:", userId);

  console.log("\nExecuting LINKEDIN_GET_MY_INFO...");
  const result = await sessionManager.executeTool("LINKEDIN_GET_MY_INFO", {}, userId, true);

  if (!result.success) {
    console.error("\nFailed fetching LinkedIn user info:", result.error);
    return;
  }

  console.log("\nLINKEDIN PROFILE RETURNED SUCCESSFULLY!");
  console.log("Raw Payload:", JSON.stringify(result.data, null, 2));

  const personId = result.data?.id || result.data?.data?.id || result.data?.sub || result.data?.user_id;
  if (personId) {
    const authorUrn = `urn:li:person:${personId}`;
    console.log("\n==================================================================");
    console.log(`Your LinkedIn Author URN: "${authorUrn}"`);
    console.log("==================================================================");
    console.log(`\nTo create a post, use LINKEDIN_CREATE_LINKED_IN_POST with:`);
    console.log(`{`);
    console.log(`  "author": "${authorUrn}",`);
    console.log(`  "commentary": "Your post text content..."`);
    console.log(`}`);
  } else {
    console.log("\nCould not automatically extract personId from response payload.");
  }
}

fetchLinkedInUserInfo().catch((err) => {
  console.error("TEST FAILED:", err.message);
  process.exit(1);
});
