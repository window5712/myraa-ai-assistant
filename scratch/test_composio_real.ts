import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { sessionManager } from "../src/lib/composio/sessionManager";
import { toolRegistry, classifyRiskLevel } from "../src/lib/composio/agentContext";

async function testRealComposioExecution() {
  console.log("==================================================================");
  console.log("       Alya Composio Real Application Data Verification Test      ");
  console.log("==================================================================");
  const userId = process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log(`Target User: ${userId}\n`);

  // 1. Obtain session
  console.log("1. Obtaining Composio Session...");
  const session = await sessionManager.getOrCreateSession(userId);
  if (!session) {
    throw new Error("FAIL: Failed initializing Composio session for user.");
  }
  console.log("PASS: Session active.\n");

  // 2. Google Drive Test
  console.log("2. Testing Google Drive Discovery & Execution...");
  const driveSearch = await sessionManager.searchToolsInSession(userId, "Google Drive search files");
  if (!driveSearch || driveSearch.primaryToolSlugs.length === 0) {
    throw new Error("FAIL: Google Drive tool discovery returned zero tools.");
  }
  const driveTool = driveSearch.primaryToolSlugs[0];
  console.log(`Discovered Drive Tool: ${driveTool}`);

  const driveRisk = classifyRiskLevel(driveTool);
  console.log(`Risk classification for ${driveTool}: ${driveRisk}`);
  if (driveRisk !== "READ") {
    throw new Error(`FAIL: Read tool ${driveTool} misclassified as ${driveRisk}`);
  }

  const driveReady = await sessionManager.ensureToolkitReady("googledrive", userId);
  if (!driveReady.ready) {
    console.warn("SKIP: Google Drive connection is not currently active.");
  } else {
    console.log(`Executing ${driveTool}...`);
    const driveResult = await sessionManager.executeTool(driveTool, { query: "" }, userId, true);
    console.log(`Execution success: ${driveResult.success}`);
    if (!driveResult.success || !driveResult.data) {
      throw new Error(`FAIL: Drive execution failed or returned empty result: ${driveResult.error}`);
    }
    console.log("Raw Drive Payload Received:", JSON.stringify(driveResult.data).slice(0, 300) + "...");
    console.log(`Extracted items count: ${driveResult.count || 0}`);
    console.log("PASS: Google Drive real data returned.\n");
  }

  // 3. Gmail Test
  console.log("3. Testing Gmail Discovery & Execution...");
  const gmailSearch = await sessionManager.searchToolsInSession(userId, "Gmail search emails");
  if (!gmailSearch || gmailSearch.primaryToolSlugs.length === 0) {
    throw new Error("FAIL: Gmail tool discovery returned zero tools.");
  }
  const gmailTool = gmailSearch.primaryToolSlugs[0];
  console.log(`Discovered Gmail Tool: ${gmailTool}`);

  const gmailReady = await sessionManager.ensureToolkitReady("gmail", userId);
  if (!gmailReady.ready) {
    console.warn("SKIP: Gmail connection is not currently active.");
  } else {
    console.log(`Executing ${gmailTool}...`);
    const gmailResult = await sessionManager.executeTool(gmailTool, { max_results: 3 }, userId, true);
    console.log(`Execution success: ${gmailResult.success}`);
    if (!gmailResult.success || !gmailResult.data) {
      throw new Error(`FAIL: Gmail execution failed or returned empty result: ${gmailResult.error}`);
    }
    console.log("Raw Gmail Payload Received:", JSON.stringify(gmailResult.data).slice(0, 300) + "...");
    console.log(`Extracted items count: ${gmailResult.count || 0}`);
    console.log("PASS: Gmail real data returned.\n");
  }

  // 4. GitHub Test
  console.log("4. Testing GitHub Discovery & Execution...");
  const ghSearch = await sessionManager.searchToolsInSession(userId, "GitHub list repos");
  if (!ghSearch || ghSearch.primaryToolSlugs.length === 0) {
    throw new Error("FAIL: GitHub tool discovery returned zero tools.");
  }
  const ghTool = ghSearch.primaryToolSlugs[0];
  console.log(`Discovered GitHub Tool: ${ghTool}`);

  const ghReady = await sessionManager.ensureToolkitReady("github", userId);
  if (!ghReady.ready) {
    console.warn("SKIP: GitHub connection is not currently active.");
  } else {
    console.log(`Executing ${ghTool}...`);
    const ghResult = await sessionManager.executeTool(ghTool, {}, userId, true);
    console.log(`Execution success: ${ghResult.success}`);
    if (!ghResult.success || !ghResult.data) {
      throw new Error(`FAIL: GitHub execution failed or returned empty result: ${ghResult.error}`);
    }
    console.log("Raw GitHub Payload Received:", JSON.stringify(ghResult.data).slice(0, 300) + "...");
    console.log(`Extracted items count: ${ghResult.count || 0}`);
    console.log("PASS: GitHub real data returned.\n");
  }

  // 5. Final Health Status
  console.log("5. Verifying Extended Diagnostic Health Endpoint Output...");
  const health = await sessionManager.getHealthStatus(userId);
  console.log("Final Health Report:", JSON.stringify(health, null, 2));

  if (!health.sessionReady || health.discoveredApplicationToolCount === 0) {
    throw new Error("FAIL: Health report indicates session failure or 0 discovered tools.");
  }

  console.log("==================================================================");
  console.log("   ALL REAL COMPOSIO APPLICATION READ OPERATIONS PASSED!         ");
  console.log("==================================================================");
}

testRealComposioExecution().catch((err) => {
  console.error("TEST FAILED WITH EXCEPTION:", err.message);
  process.exit(1);
});
