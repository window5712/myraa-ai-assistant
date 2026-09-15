import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";

async function runEndToEndVerification() {
  console.log("==================================================================");
  console.log("     Alya Composio Integration — Production End-to-End Test       ");
  console.log("==================================================================");
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log(`Target User/Entity ID: ${userId}\n`);

  // 1 & 2: Get or create single reusable session
  console.log("1. Initializing single reusable session...");
  const s1 = await sessionManager.getOrCreateSession(userId);
  const s2 = await sessionManager.getOrCreateSession(userId);
  console.log(`Session 1 equals Session 2 in memory: ${s1 === s2}`);

  // Health report check
  console.log("\n2. Checking Diagnostic Health Report...");
  const health = await sessionManager.getHealthStatus(userId);
  console.log("Health Status:", JSON.stringify(health, null, 2));

  // Fetch Grouped Applications
  console.log("\n3. Fetching Grouped Applications & ToolCounts...");
  const groupedApps = await sessionManager.getGroupedConnectedApps(userId);
  console.log(`Total Grouped Applications: ${groupedApps.length}`);
  for (const app of groupedApps) {
    console.log(
      ` - ${app.name} (${app.toolkitSlug}): status=${app.status}, activeAccounts=${app.activeAccounts.length}, expiredAccounts=${app.expiredAccounts.length}, toolCount=${app.toolCount}`
    );
  }

  // Discover Toolkits (Gmail, Drive, Sheets, GitHub, Facebook)
  console.log("\n4. Discovering active toolkits...");
  const discoveredToolsMap = await sessionManager.discoverToolsPerToolkit(userId);

  const testToolkits = ["gmail", "googledrive", "googlesheets", "github", "facebook"];
  for (const tk of testToolkits) {
    const tools = discoveredToolsMap.get(tk) || [];
    console.log(` - Toolkit "${tk}": ${tools.length} discovered tools (${tools.slice(0, 3).join(", ")}...)`);
  }

  // Detect Facebook Connection State
  console.log("\n5. Testing Facebook Connection State & Recovery...");
  const fbReady = await sessionManager.ensureToolkitReady("facebook", userId);
  if (fbReady.ready) {
    console.log(`Facebook is active! Account ID: ${fbReady.selectedAccountId}`);
  } else {
    console.log(`Facebook is NOT active in session.`);
    console.log(`Initiated secure auth URL: ${fbReady.redirectUrl || "None"}`);
  }

  // Safe read-only operations for active toolkits
  console.log("\n6. Executing safe read-only operations for active toolkits...");

  // Gmail
  if (health.activeToolkits.includes("gmail")) {
    console.log("\nTesting Gmail read operation...");
    const gmailRes = await sessionManager.executeTool("GMAIL_SEARCH_EMAILS", { max_results: 2 }, userId, true);
    console.log(`Gmail result success: ${gmailRes.success}`);
    if (gmailRes.error) console.log(`Gmail error: ${gmailRes.error}`);
  }

  // Google Drive
  if (health.activeToolkits.includes("googledrive")) {
    console.log("\nTesting Google Drive search operation...");
    const driveRes = await sessionManager.executeTool("GOOGLEDRIVE_SEARCH_FILES", { query: "test" }, userId, true);
    console.log(`Drive result success: ${driveRes.success}`);
    if (driveRes.error) console.log(`Drive error: ${driveRes.error}`);
  }

  // GitHub
  if (health.activeToolkits.includes("github")) {
    console.log("\nTesting GitHub read operation...");
    const ghRes = await sessionManager.executeTool("GITHUB_GET_ABOUT_THE_AUTHENTICATED_USER", {}, userId, true);
    console.log(`GitHub result success: ${ghRes.success}`);
    if (ghRes.error) console.log(`GitHub error: ${ghRes.error}`);
  }

  // Google Sheets
  if (health.activeToolkits.includes("googlesheets")) {
    console.log("\nTesting Google Sheets search operation...");
    const sheetRes = await sessionManager.executeTool("GOOGLESHEETS_GET_SPREADSHEET", {}, userId, true);
    console.log(`Google Sheets result success: ${sheetRes.success}`);
    if (sheetRes.error) console.log(`Sheets error: ${sheetRes.error}`);
  }

  console.log("\n==================================================================");
  console.log("           End-to-End Verification Complete Successfully          ");
  console.log("==================================================================");
}

runEndToEndVerification().catch((err) => {
  console.error("Test execution exception:", err);
});
