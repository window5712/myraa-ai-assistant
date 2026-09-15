import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { sessionManager } from "./src/lib/composio/sessionManager.js";

async function checkSchemas() {
  const tools = [
    "FACEBOOK_CREATE_POST",
    "FACEBOOK_LIST_MANAGED_PAGES",
    "FACEBOOK_CREATE_PHOTO_POST",
    "FACEBOOK_GET_PAGE_POSTS",
    "LINKEDIN_CREATE_COMPANY_POST",
    "LINKEDIN_CREATE_POST",
    "LINKEDIN_SHARE_POST"
  ];
  
  const res = await sessionManager.getToolSchemasMap(tools, "aryan");
  console.log("=== COMPOSIO TOOL SCHEMAS ===");
  console.log(JSON.stringify(res, null, 2));
}

checkSchemas().catch(console.error);
