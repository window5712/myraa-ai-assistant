import dotenv from "dotenv";
import { Composio } from "@composio/core";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function inspectComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return;

  const composio = new Composio({ apiKey }) as any;
  console.log("=== Inspecting Composio Methods ===");
  console.log("composio.connectedAccounts keys:", Object.keys(composio.connectedAccounts || {}));
  console.log("composio keys:", Object.keys(composio));

  try {
    const session = await composio.create("aryan");
    console.log("Session keys:", Object.keys(session));
  } catch (e: any) {
    console.error("Error creating session:", e.message);
  }
}

inspectComposio();
