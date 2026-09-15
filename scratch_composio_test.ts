import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getComposioClient, getConnectedApps, discoverTools } from "./src/lib/composio/composioClient.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function test() {
  console.log("Testing Composio API Key:", process.env.COMPOSIO_API_KEY ? "Present" : "Missing");
  try {
    const client = await getComposioClient();
    console.log("Client initialized:", !!client);
    if (client) {
      const apps = await getConnectedApps("default");
      console.log("Connected Apps:", JSON.stringify(apps, null, 2));
      const tools = await discoverTools("default");
      console.log("Discovered Tools count:", tools.length);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
