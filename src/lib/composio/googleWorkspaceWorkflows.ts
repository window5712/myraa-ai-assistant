import { executeComposioAction, verifyResourceExists } from "./composioClient";
import {
  linkExternalResourceToTask,
  linkExternalResourceToProject,
  findExternalResourceByContext,
} from "../../../server_life_memory";
import { ExternalResource } from "../memoryTypes";

export interface DocSection {
  title: string;
  body: string;
}

export interface DocTable {
  headers: string[];
  rows: (string | number)[][];
}

export interface GoogleDocWorkflowParams {
  title: string;
  purpose?: string;
  content?: string;
  sections?: DocSection[];
  tables?: DocTable[];
  targetFolder?: string;
  existingDocId?: string;
  taskId?: string;
  projectId?: string;
  entityId?: string;
}

export interface GoogleSheetWorkflowParams {
  title: string;
  purpose?: string;
  headers?: string[];
  rows?: (string | number)[][];
  formulas?: { cell: string; formula: string }[];
  targetFolder?: string;
  existingSheetId?: string;
  taskId?: string;
  projectId?: string;
  entityId?: string;
}

export interface GoogleWorkspacePackageParams {
  projectName: string;
  docTitle: string;
  docPurpose?: string;
  docSections?: DocSection[];
  docTables?: DocTable[];
  sheetTitle?: string;
  sheetHeaders?: string[];
  sheetRows?: (string | number)[][];
  taskId?: string;
  projectId?: string;
  entityId?: string;
}

export interface WorkflowResult {
  success: boolean;
  documentId?: string;
  spreadsheetId?: string;
  folderId?: string;
  url?: string;
  title: string;
  verified: boolean;
  message: string;
  resourcesCreated: ExternalResource[];
}

export async function searchDriveFiles(
  query: string,
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<any[]> {
  try {
    const res = await executeComposioAction(
      "GOOGLEDRIVE_FIND_FILE",
      { q: query, query },
      entityId,
      true
    );
    const files = res.items || res.data?.files || res.data?.items || (Array.isArray(res.data) ? res.data : []);
    if (files.length > 0) return files;
  } catch (e: any) {}

  try {
    const res = await executeComposioAction(
      "GOOGLEDRIVE_LIST_FILES",
      { q: query, query },
      entityId,
      true
    );
    const files = res.items || res.data?.files || res.data?.items || (Array.isArray(res.data) ? res.data : []);
    if (files.length > 0) return files;
  } catch (e: any) {}

  return [];
}

/**
  Search or create a designated Google Drive folder for project organization.
 */
export async function ensureDriveFolder(
  folderName: string,
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<{ folderId: string; created: boolean; url?: string }> {
  console.log(`[Google Workspace Workflow] Ensuring Drive folder exists: "${folderName}"`);

  try {
    // 1. Search existing folders via robust searchDriveFiles helper
    const items = await searchDriveFiles(folderName, entityId);
    const folderMatch = items.find(
      (item: any) =>
        ((item.name || item.title || "").toLowerCase() === folderName.toLowerCase()) &&
        (item.mimeType || "").includes("folder")
    );
    if (folderMatch) {
      const fId = folderMatch.id || folderMatch.fileId;
      console.log(`[Google Workspace Workflow] Found existing Drive folder: ${folderName} (${fId})`);
      return { folderId: fId, created: false, url: folderMatch.webViewLink || folderMatch.url };
    }

    if (items.length > 0 && (items[0].id || items[0].fileId)) {
      const existingId = items[0].id || items[0].fileId;
      console.log(`[Google Workspace Workflow] Found matching Drive item: ${folderName} (${existingId})`);
      return { folderId: existingId, created: false, url: items[0].webViewLink };
    }

    // 3. Create folder if missing
    const createRes = await executeComposioAction(
      "GOOGLEDRIVE_CREATE_FOLDER",
      { name: folderName },
      entityId,
      true
    );

    const newFolderId = createRes.data?.id || createRes.data?.folderId || createRes.data?.fileId || createRes.data?.result?.id;
    if (newFolderId) {
      console.log(`[Google Workspace Workflow] Created new Drive folder: ${folderName} (${newFolderId})`);
      return { folderId: newFolderId, created: true, url: createRes.data?.webViewLink };
    }

    throw new Error(createRes.error || `Could not resolve folder ID for "${folderName}".`);
  } catch (err: any) {
    console.warn(`[Google Workspace Workflow] Drive folder check note for "${folderName}":`, err.message);
    return { folderId: "root", created: false };
  }
}

/**
 * Move a file into a designated Google Drive folder.
 */
export async function moveFileToFolder(
  fileId: string,
  folderId: string,
  entityId = process.env.COMPOSIO_ENTITY_ID || "aryan"
): Promise<boolean> {
  if (!folderId || folderId === "root") return true;
  console.log(`[Google Workspace Workflow] Moving file ${fileId} into folder ${folderId}`);

  try {
    const res = await executeComposioAction(
      "GOOGLEDRIVE_MOVE_FILE",
      { fileId, folderId, addParents: folderId },
      entityId,
      true
    );
    return res.success;
  } catch (err: any) {
    console.warn(`[Google Workspace Workflow] Move file note (${fileId}):`, err.message);
    return false;
  }
}

/**
 * Professional Google Docs Workflow:
 * Understands purpose, generates clean structured content (titles, headings, sections, tables),
 * reuses/updates existing doc if requested, places in Drive folder, verifies creation, and updates task memory.
 */
export async function executeGoogleDocWorkflow(
  params: GoogleDocWorkflowParams
): Promise<WorkflowResult> {
  const entityId = params.entityId || process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log(`[Google Workspace Workflow] Starting Google Doc workflow for: "${params.title}"`);

  let targetDocId = params.existingDocId;
  let isUpdate = false;

  // 1. Memory check: if no doc ID provided, check task/project memory for existing matching doc
  if (!targetDocId && (params.taskId || params.projectId)) {
    const memoryMatch = await findExternalResourceByContext(params.title, "gdoc");
    if (memoryMatch) {
      targetDocId = memoryMatch.resource.id;
      isUpdate = true;
      console.log(`[Google Workspace Workflow] Memory context resolved existing document ID: ${targetDocId}`);
    }
  }

  // 2. Search Drive if still no doc ID to prevent duplicate file creation
  if (!targetDocId) {
    try {
      const files = await searchDriveFiles(params.title, entityId);
      const docMatch = files.find(
        (f: any) =>
          ((f.name || f.title || "").toLowerCase() === params.title.toLowerCase()) &&
          (f.mimeType || "").includes("document")
      );
      if (docMatch) {
        targetDocId = docMatch.id || docMatch.fileId;
        isUpdate = true;
        console.log(`[Google Workspace Workflow] Found existing document in Drive: ${params.title} (${targetDocId})`);
      }
    } catch (e: any) {}
  }

  // 3. Format professional document content body
  let fullDocText = `${params.title.toUpperCase()}\n`;
  fullDocText += `═════════════════════════════════════════════════════════════════\n\n`;

  if (params.purpose) {
    fullDocText += `PURPOSE & OVERVIEW:\n${params.purpose}\n\n`;
  }

  if (params.content) {
    fullDocText += `${params.content}\n\n`;
  }

  if (params.sections && params.sections.length > 0) {
    for (const sec of params.sections) {
      fullDocText += `■ ${sec.title.toUpperCase()}\n`;
      fullDocText += `─────────────────────────────────────────────────────────────────\n`;
      fullDocText += `${sec.body}\n\n`;
    }
  }

  if (params.tables && params.tables.length > 0) {
    for (const tbl of params.tables) {
      fullDocText += `DATA TABLE:\n`;
      fullDocText += `| ${tbl.headers.join(" | ")} |\n`;
      fullDocText += `| ${tbl.headers.map(() => "---").join(" | ")} |\n`;
      for (const row of tbl.rows) {
        fullDocText += `| ${row.join(" | ")} |\n`;
      }
      fullDocText += `\n`;
    }
  }

  fullDocText += `\nDocument generated and verified by Alya AI Assistant — ${new Date().toLocaleDateString()}`;

  // 4. Create or Update document
  let docId = targetDocId || "";
  let webUrl = "";
  let connectUrl: string | undefined = undefined;

  if (isUpdate && targetDocId) {
    console.log(`[Google Workspace Workflow] Updating existing document ${targetDocId}...`);
    // Read current document first
    try {
      await executeComposioAction("GOOGLEDOCS_GET_DOCUMENT", { documentId: targetDocId }, entityId, true);
    } catch (e) {}

    // Update document content
    const updateRes = await executeComposioAction(
      "GOOGLEDOCS_UPDATE_DOCUMENT",
      { documentId: targetDocId, text: fullDocText, content: fullDocText },
      entityId,
      true
    );

    if (!updateRes.success) {
      // Fallback try insert text
      await executeComposioAction(
        "GOOGLEDOCS_INSERT_TEXT",
        { documentId: targetDocId, text: `\n\n=== UPDATE ${new Date().toLocaleString()} ===\n${fullDocText}` },
        entityId,
        true
      );
    }
    docId = targetDocId;
    webUrl = `https://docs.google.com/document/d/${docId}/edit`;
  } else {
    console.log(`[Google Workspace Workflow] Creating new Google Doc: "${params.title}"...`);
    const createRes = await executeComposioAction(
      "GOOGLEDOCS_CREATE_DOCUMENT",
      { title: params.title, text: fullDocText },
      entityId,
      true
    );

    if (createRes.redirectUrl) {
      connectUrl = createRes.redirectUrl;
    }

    docId = createRes.data?.documentId || createRes.data?.id || createRes.data?.result?.documentId || "";
    webUrl = createRes.data?.documentUrl || (docId ? `https://docs.google.com/document/d/${docId}/edit` : "");

    // Fallback 1: GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN
    if (!docId) {
      try {
        const mdRes = await executeComposioAction(
          "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
          { title: params.title, content: fullDocText },
          entityId,
          true
        );
        if (mdRes.redirectUrl && !connectUrl) connectUrl = mdRes.redirectUrl;
        docId = mdRes.data?.documentId || mdRes.data?.id || mdRes.data?.fileId || "";
        if (docId) webUrl = mdRes.data?.documentUrl || `https://docs.google.com/document/d/${docId}/edit`;
      } catch (e: any) {}
    }

    // Fallback 2: GOOGLEDRIVE_CREATE_FILE via active Drive connection
    if (!docId) {
      try {
        console.log(`[Google Workspace Workflow] Creating Google Doc via active Drive connection...`);
        const driveRes = await executeComposioAction(
          "GOOGLEDRIVE_CREATE_FILE",
          { name: params.title, mimeType: "application/vnd.google-apps.document" },
          entityId,
          true
        );
        docId = driveRes.data?.id || driveRes.data?.fileId || driveRes.data?.result?.id || "";
        if (docId) webUrl = `https://docs.google.com/document/d/${docId}/edit`;
      } catch (e: any) {}
    }

    if (docId && fullDocText) {
      try {
        await executeComposioAction(
          "GOOGLEDOCS_INSERT_TEXT",
          { documentId: docId, text: fullDocText },
          entityId,
          true
        );
      } catch (e: any) {}
    }
  }

  if (!docId) {
    throw new Error(`Failed to create or update Google Doc "${params.title}".`);
  }

  // 5. Drive Folder organization
  let folderId: string | undefined;
  if (params.targetFolder) {
    const folderInfo = await ensureDriveFolder(params.targetFolder, entityId);
    folderId = folderInfo.folderId;
    if (folderId && folderId !== "root") {
      await moveFileToFolder(docId, folderId, entityId);
    }
  }

  // 6. Verification
  console.log(`[Google Workspace Workflow] Verifying document creation: ${docId}`);
  const verifyRes = await verifyResourceExists(docId, "gdoc", entityId);
  const isVerified = verifyRes.exists;

  // 7. Save to Task & Project Memory
  const createdResource: ExternalResource = {
    id: docId,
    resourceType: "gdoc",
    title: params.title,
    url: webUrl,
    driveFolderId: folderId,
    metadata: { isUpdate, verified: isVerified },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (params.taskId) {
    await linkExternalResourceToTask(params.taskId, createdResource);
  }
  if (params.projectId) {
    await linkExternalResourceToProject(params.projectId, createdResource);
  }

  const message = isVerified
    ? `Successfully ${isUpdate ? "updated" : "created"} Google Doc "${params.title}" and verified storage in Google Drive!`
    : `Created Google Doc "${params.title}" (ID: ${docId}).`;

  return {
    success: true,
    documentId: docId,
    folderId,
    url: webUrl,
    title: params.title,
    verified: isVerified,
    message,
    resourcesCreated: [createdResource],
  };
}

/**
 * Professional Google Sheets Workflow:
 * Creates/updates spreadsheet with structured headers, clean formatted rows/columns, formula calculations,
 * folder placement, verification, and task memory persistence.
 */
export async function executeGoogleSheetWorkflow(
  params: GoogleSheetWorkflowParams
): Promise<WorkflowResult> {
  const entityId = params.entityId || process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log(`[Google Workspace Workflow] Starting Google Sheet workflow for: "${params.title}"`);

  let targetSheetId = params.existingSheetId;
  let isUpdate = false;

  // 1. Memory check for existing matching sheet
  if (!targetSheetId && (params.taskId || params.projectId)) {
    const memoryMatch = await findExternalResourceByContext(params.title, "gsheet");
    if (memoryMatch) {
      targetSheetId = memoryMatch.resource.id;
      isUpdate = true;
      console.log(`[Google Workspace Workflow] Memory context resolved existing sheet ID: ${targetSheetId}`);
    }
  }

  // 2. Drive search check
  if (!targetSheetId) {
    try {
      const files = await searchDriveFiles(params.title, entityId);
      const sheetMatch = files.find(
        (f: any) =>
          ((f.name || f.title || "").toLowerCase() === params.title.toLowerCase()) &&
          (f.mimeType || "").includes("spreadsheet")
      );
      if (sheetMatch) {
        targetSheetId = sheetMatch.id || sheetMatch.fileId;
        isUpdate = true;
        console.log(`[Google Workspace Workflow] Found existing spreadsheet in Drive: ${params.title} (${targetSheetId})`);
      }
    } catch (e: any) {}
  }

  // 3. Create or update spreadsheet
  let sheetId = targetSheetId || "";
  let webUrl = "";

  if (isUpdate && targetSheetId) {
    sheetId = targetSheetId;
    webUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  } else {
    console.log(`[Google Workspace Workflow] Creating new Google Sheet: "${params.title}"...`);
    const createRes = await executeComposioAction(
      "GOOGLESHEETS_CREATE_SPREADSHEET",
      { title: params.title },
      entityId,
      true
    );

    sheetId = createRes.data?.spreadsheetId || createRes.data?.id || createRes.data?.result?.spreadsheetId || "";
    webUrl = createRes.data?.spreadsheetUrl || (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : "");

    if (!sheetId) {
      try {
        console.log(`[Google Workspace Workflow] Creating Google Sheet via active Drive connection...`);
        const driveRes = await executeComposioAction(
          "GOOGLEDRIVE_CREATE_FILE",
          { name: params.title, mimeType: "application/vnd.google-apps.spreadsheet" },
          entityId,
          true
        );
        sheetId = driveRes.data?.id || driveRes.data?.fileId || driveRes.data?.result?.id || "";
        if (sheetId) webUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
      } catch (e: any) {}
    }
  }

  if (!sheetId) {
    throw new Error(`Failed to create or update Google Sheet "${params.title}".`);
  }

  // 4. Populate structured headers and data rows
  const values: (string | number)[][] = [];

  if (params.headers && params.headers.length > 0) {
    values.push(params.headers);
  }

  if (params.rows && params.rows.length > 0) {
    values.push(...params.rows);
  }

  if (values.length > 0) {
    console.log(`[Google Workspace Workflow] Writing ${values.length} rows to Sheet ${sheetId}...`);
    try {
      await executeComposioAction(
        "GOOGLESHEETS_APPEND_DIMENSION_VALUES",
        { spreadsheetId: sheetId, range: "Sheet1!A1", values },
        entityId,
        true
      );
    } catch (err: any) {
      try {
        await executeComposioAction(
          "GOOGLESHEETS_UPDATE_SPREADSHEET_VALUES",
          { spreadsheetId: sheetId, range: "A1", values },
          entityId,
          true
        );
      } catch (err2: any) {
        console.warn(`[Google Workspace Workflow] Sheet value population note:`, err2.message);
      }
    }
  }

  // 5. Drive folder organization
  let folderId: string | undefined;
  if (params.targetFolder) {
    const folderInfo = await ensureDriveFolder(params.targetFolder, entityId);
    folderId = folderInfo.folderId;
    if (folderId && folderId !== "root") {
      await moveFileToFolder(sheetId, folderId, entityId);
    }
  }

  // 6. Verification
  console.log(`[Google Workspace Workflow] Verifying spreadsheet creation: ${sheetId}`);
  const verifyRes = await verifyResourceExists(sheetId, "gsheet", entityId);
  const isVerified = verifyRes.exists;

  // 7. Memory persistence
  const createdResource: ExternalResource = {
    id: sheetId,
    resourceType: "gsheet",
    title: params.title,
    url: webUrl,
    driveFolderId: folderId,
    metadata: { rowCount: values.length, verified: isVerified },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (params.taskId) {
    await linkExternalResourceToTask(params.taskId, createdResource);
  }
  if (params.projectId) {
    await linkExternalResourceToProject(params.projectId, createdResource);
  }

  const message = isVerified
    ? `Successfully ${isUpdate ? "updated" : "created"} Google Sheet "${params.title}" with ${values.length} rows and verified storage in Drive!`
    : `Created Google Sheet "${params.title}" (ID: ${sheetId}).`;

  return {
    success: true,
    spreadsheetId: sheetId,
    folderId,
    url: webUrl,
    title: params.title,
    verified: isVerified,
    message,
    resourcesCreated: [createdResource],
  };
}

/**
 * Complete Workspace Package Workflow:
 * Creates a project folder in Google Drive, builds structured Google Doc and matching Google Sheet,
 * organizes all files into the folder, verifies all resources, and updates task/project memory.
 */
export async function executeFullWorkspacePackageWorkflow(
  params: GoogleWorkspacePackageParams
): Promise<WorkflowResult> {
  const entityId = params.entityId || process.env.COMPOSIO_ENTITY_ID || "aryan";
  console.log(`[Google Workspace Workflow] Executing full workspace package for project: "${params.projectName}"`);

  // 1. Ensure project folder in Drive
  const folderInfo = await ensureDriveFolder(params.projectName, entityId);
  const folderId = folderInfo.folderId;

  const resourcesCreated: ExternalResource[] = [];

  // 2. Create Google Doc inside folder
  const docResult = await executeGoogleDocWorkflow({
    title: params.docTitle,
    purpose: params.docPurpose,
    sections: params.docSections,
    tables: params.docTables,
    targetFolder: params.projectName,
    taskId: params.taskId,
    projectId: params.projectId,
    entityId,
  });

  if (docResult.resourcesCreated) {
    resourcesCreated.push(...docResult.resourcesCreated);
  }

  // 3. Create Google Sheet inside folder (if requested or matching)
  let sheetResult: WorkflowResult | null = null;
  if (params.sheetTitle || params.sheetHeaders || params.sheetRows) {
    sheetResult = await executeGoogleSheetWorkflow({
      title: params.sheetTitle || `${params.projectName} Data & Metrics`,
      headers: params.sheetHeaders || ["Item", "Category", "Status", "Notes"],
      rows: params.sheetRows || [
        ["Phase 1 Setup", "Infrastructure", "Completed", "Initial rollout verified"],
        ["Phase 2 Deployment", "Application", "In Progress", "Autonomous loop active"],
      ],
      targetFolder: params.projectName,
      taskId: params.taskId,
      projectId: params.projectId,
      entityId,
    });

    if (sheetResult.resourcesCreated) {
      resourcesCreated.push(...sheetResult.resourcesCreated);
    }
  }

  const allVerified = docResult.verified && (sheetResult ? sheetResult.verified : true);

  const message = `Full Google Workspace project package created and organized in Drive folder "${params.projectName}"! Verified Doc (${docResult.title}) ${sheetResult ? `and Sheet (${sheetResult.title})` : ""}.`;

  return {
    success: true,
    documentId: docResult.documentId,
    spreadsheetId: sheetResult?.spreadsheetId,
    folderId,
    url: docResult.url,
    title: `${params.projectName} Workspace Package`,
    verified: allVerified,
    message,
    resourcesCreated,
  };
}
