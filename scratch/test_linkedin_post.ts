import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";

async function publishLinkedInPost() {
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  const authorUrn = "urn:li:person:6D9FzrCRGq";
  const postText = "Testing automated AI post publishing via Alya Assistant & Composio! 🚀 #FullStack #AI";

  console.log("==================================================================");
  console.log("             LinkedIn Real Post Publishing Test                   ");
  console.log("==================================================================");
  console.log("Target User:", userId);
  console.log("Author URN:", authorUrn);
  console.log("Post Message:", postText);

  console.log("\nExecuting LINKEDIN_CREATE_LINKED_IN_POST...");
  const result = await sessionManager.executeTool(
    "LINKEDIN_CREATE_LINKED_IN_POST",
    {
      author: authorUrn,
      commentary: postText,
      visibility: "PUBLIC"
    },
    userId,
    true // bypass confirmation check for debug test
  );

  if (!result.success) {
    console.error("\nFAIL: LinkedIn Post Creation Error:", result.error);
    return;
  }

  console.log("\nPASS: LINKEDIN POST CREATED SUCCESSFULLY!");
  console.log("Raw Payload:", JSON.stringify(result.data, null, 2));
}

publishLinkedInPost().catch((err) => {
  console.error("TEST FAILED WITH EXCEPTION:", err.message);
  process.exit(1);
});
