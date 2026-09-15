import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { executeComposioAction } from "./src/lib/composio/composioClient.js";

async function testFacebookPost() {
  console.log("=== Testing FACEBOOK_CREATE_POST ===");
  const params = {
    page_id: "1191196240750507",
    message: "Test post from Alya AI Assistant: Facebook integration parameters verified successfully!"
  };
  
  const result = await executeComposioAction("FACEBOOK_CREATE_POST", params, "aryan", true);
  console.log("Result:", JSON.stringify(result, null, 2));
}

testFacebookPost().catch(console.error);
