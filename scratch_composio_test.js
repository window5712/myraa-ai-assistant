import dotenv from "dotenv";
import { executeComposioAction, initiateAppConnection } from "./src/lib/composio/composioClient.ts";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function test() {
  console.log("Testing GMAIL_LIST_MESSAGES execution via composioClient...");
  const res = await executeComposioAction("GMAIL_LIST_MESSAGES", { userId: "me" }, "aryan");
  console.log("Execution Result:", JSON.stringify(res, null, 2));

  console.log("Testing initiateAppConnection for gmail...");
  const conn = await initiateAppConnection("gmail", "aryan");
  console.log("Connection Link Result:", JSON.stringify(conn, null, 2));
}

test();
