import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { sessionManager } from "./src/lib/composio/sessionManager.js";

async function testSchema() {
  const client = await sessionManager.getClient();
  const session = await sessionManager.getOrCreateSession("aryan");
  
  console.log("Client keys:", Object.keys(client));
  console.log("Client.tools keys:", client.tools ? Object.keys(client.tools) : "none");
  console.log("Session keys:", Object.keys(session));
  console.log("Session proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(session)));

  if (typeof session.execute === "function") {
    try {
      const res = await session.execute("COMPOSIO_GET_TOOL_SCHEMAS", { tool_slugs: ["FACEBOOK_CREATE_POST"] });
      console.log("session.execute COMPOSIO_GET_TOOL_SCHEMAS raw res:", JSON.stringify(res, null, 2));
    } catch (e: any) {
      console.log("session.execute COMPOSIO_GET_TOOL_SCHEMAS error:", e.message);
    }
  }

  if (typeof session.tools === "function") {
    try {
      const tools = await session.tools();
      console.log("session.tools() returned count:", tools?.length);
      if (tools && tools.length > 0) {
        console.log("Sample tool schema:", JSON.stringify(tools[0], null, 2));
      }
    } catch (e: any) {
      console.log("session.tools() error:", e.message);
    }
  }
}

testSchema().catch(console.error);
