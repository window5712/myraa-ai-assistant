import fs from "fs/promises";
import path from "path";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { Memory, MemoryTransaction } from "./src/lib/memoryTypes";

function resolveDataFilePath(filename: string): string {
  const baseDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, "AlyaAIAgent")
    : (process.env.HOME ? path.join(process.env.HOME, ".alya-ai-agent") : process.cwd());

  try {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    const userPath = path.join(baseDir, filename);
    if (!existsSync(userPath)) {
      const defaultPath = path.join(process.cwd(), filename);
      if (existsSync(defaultPath)) {
        copyFileSync(defaultPath, userPath);
      }
    }
    return userPath;
  } catch (e) {
    return path.join(process.cwd(), filename);
  }
}

const MEMORY_FILE = resolveDataFilePath("memories.json");

// Safe file operations with fallback
export async function loadMemories(): Promise<Memory[]> {
  try {
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(data) as Memory[];
  } catch (error: any) {
    // If file doesn't exist, return empty array
    if (error.code === "ENOENT") {
      return [];
    }
    console.error("[Memory] Error loading memories, returning fallback:", error);
    return [];
  }
}

export async function saveMemories(memories: Memory[]): Promise<void> {
  try {
    await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), "utf-8");
    console.log(`[Memory] Saved ${memories.length} memories successfully.`);
  } catch (error) {
    console.error("[Memory] Error writing memory file:", error);
  }
}

// Format memory core to system instruction injections
export function formatSystemInstructionsWithMemories(baseInstruction: string, memories: Memory[]): string {
  if (memories.length === 0) {
    return baseInstruction +
      "\n\n" +
      "=== ALYA MEMORY CORE ===\n" +
      "You do not possess any historic recollections of this companion yet. " +
      "As you speak, pay deep attention to who they are, their projects, relationships, and habits so you naturally grow closer over time.\n" +
      "=========================\n";
  }

  // Group by category
  const grouped: Record<string, string[]> = {};
  memories.forEach((m) => {
    grouped[m.category] = grouped[m.category] || [];
    grouped[m.category].push(m.text);
  });

  let memoryBlock =
    "\n\n" +
    "=== ALYA PERSISTENT MEMORY CORE (RECOLLECTIONS) ===\n" +
    "You have spoken with this user for a long duration. Below are your persistent recollections of who they are.\n" +
    "CRITICAL BRAND AND COGNITIVE PRINCIPLES:\n" +
    "- INTEGRATE MEMORIES INSTINCTIVELY: Always make conversational references feel completely smooth, natural, and human. NEVER say 'According to my memory files...', 'My recollection database indicates...', or 'As you told me on June 12th...'. Instead, speak of these details casually and supportively as a true friend would (e.g. 'Oh, since you're working on that website project...', 'I hope you're keeping up with your YouTube channel goals too!').\n" +
    "- COMPANIONSHIP DEPTH: Allow your witty and responsive personality to adapt with empathy, based on their goals, life events, emotional milestones, and preferences.\n\n" +
    "CURRENT PERSISTENT KNOWLEDGE CARD:\n";

  const categoriesOrdered = [
    { key: "identity", label: "Identity (Name, nick, profession, background)" },
    { key: "preference", label: "Preferences & Tastes (Likes, dislikes, games, movies)" },
    { key: "goal", label: "Active Goals & Aspirations" },
    { key: "project", label: "Ongoing Projects & Ecosystems" },
    { key: "relationship", label: "Key People & Relationships mentioned" },
    { key: "emotional", label: "Emotional Highlights & Core Milestones" },
    { key: "behavior", label: "Observed Traits & Behavioral Tendencies" },
    { key: "tool_preference", label: "Tool Preferences & Apps Used" },
    { key: "workflow", label: "Workflow Patterns & Habits" },
    { key: "communication_style", label: "Communication Style Preferences" },
  ];

  categoriesOrdered.forEach((cat) => {
    const list = grouped[cat.key] || [];
    if (list.length > 0) {
      memoryBlock += `* ${cat.label}:\n` + list.map(t => `  - ${t}`).join("\n") + "\n";
    }
  });

  memoryBlock += "====================================================\n";

  return baseInstruction + memoryBlock;
}

const SENSITIVE_MEMORY_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /bearer\s+[a-z0-9._-]+/i,
  /private[_-]?key/i,
  /token\s*[:=]\s*[a-z0-9._-]+/i,
];

export function isSensitiveText(text: string): boolean {
  return SENSITIVE_MEMORY_PATTERNS.some((pattern) => pattern.test(text));
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const memories = await loadMemories();
  if (!query || !query.trim()) return memories;
  const q = query.toLowerCase();
  return memories.filter(
    (m) => m.text.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
  );
}

// Update an existing memory record
export async function updateMemory(id: string, category: string, text: string): Promise<Memory | null> {
  const memories = await loadMemories();
  const index = memories.findIndex((m) => m.id === id);
  if (index === -1) return null;

  const timestamp = new Date().toISOString();
  memories[index] = {
    ...memories[index],
    category: category as any,
    text,
    updatedAt: timestamp,
  };
  await saveMemories(memories);
  return memories[index];
}

// Background memory consolidation queue lock
let isConsolidating = false;

export async function processConversationSlice(
  apiKey: string,
  dialogueHistory: { role: string; text: string }[]
): Promise<Memory[] | null> {
  if (isConsolidating) {
    console.log("[Memory] Consolidation loop busy, skipping slice processing");
    return null;
  }

  if (dialogueHistory.length < 1) {
    return null;
  }

  isConsolidating = true;
  console.log("[Memory] Initiating pipeline for dialogue slice of length:", dialogueHistory.length);

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const currentMemories = await loadMemories();

    // Format memory map to help Gemini understand what to edit
    const memoryContext = currentMemories.map(m => `ID: ${m.id} | Category: ${m.category} | Fact: ${m.text}`).join("\n");
    const dialogueContext = dialogueHistory.map(line => `${line.role === "user" ? "User" : "Alya"}: ${line.text}`).join("\n");

    const prompt = `You are Alya's deep cognitive recollection engine. Your task is to analyze the recent conversation piece against previous persistent memories, and output precise update transactions.

### OBJECTIVE
Decide if any statements contain durable, important personal facts, enduring preferences, aspirations, ongoing projects, critical relationships, key historical emotional events, or behavioral trends.
Avoid cataloging small talk, greetings, general chit-chat, or fleeting sentences (e.g., ignore 'hello', 'how are you', 'waking up', 'lol').
DO NOT store secrets, API keys, passwords, or credentials.

### CURRENT USER MEMORIES:
${memoryContext || "(No memory records exist)"}

### RECENT DIALOGUE SLICE:
${dialogueContext}

### RULES
- ACTIONS:
  - "ADD": If new material information is introduced (e.g. user says 'My favorite food is lasagna' and it's not present).
  - "UPDATE": If previous information has evolved or is corrected (e.g. user says 'I changed my major to computer science' when memory says they study history). Provide the exact ID of the memory to replace.
  - "REMOVE": If a memory was explicitly disproven or the user directly asked Alya to forget it.
- TEXT STYLE: Express the memories as clean, concise, third-person declarative summaries (e.g., 'The user is building a startup named Alya.', 'The user loves playing GTA 6.', 'The user enjoys technical and fast-paced styling explanations.'). Do not include conversational filler, quotes, or timestamps.
- ID: For ADD, leave blank. For UPDATE or REMOVE, provide the exact 'id' from the "Current user memories" list.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description: "ADD, UPDATE, or REMOVE transaction.",
                    enum: ["ADD", "UPDATE", "REMOVE"]
                  },
                  id: {
                    type: Type.STRING,
                    description: "Specific ID of the existing memory being modified or deleted (leave blank/null for ADD)."
                  },
                  category: {
                    type: Type.STRING,
                    description: "The Memory category classification.",
                    enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior", "tool_preference", "workflow", "communication_style"]
                  },
                  text: {
                    type: Type.STRING,
                    description: "The memory summarized as a concise declarative statement in third-person."
                  }
                },
                required: ["action", "category", "text"]
              }
            }
          },
          required: ["transactions"]
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const resultObj = JSON.parse(resultText);
    const transactions: MemoryTransaction[] = resultObj.transactions || [];

    if (transactions.length === 0) {
      console.log("[Memory] Zero transactions generated. Ignored routine conversations.");
      isConsolidating = false;
      return null;
    }

    console.log(`[Memory] Processing ${transactions.length} memory updates:`, JSON.stringify(transactions));

    let updatedMemories = [...currentMemories];
    const timestamp = new Date().toISOString();

    for (const trx of transactions) {
      if (isSensitiveText(trx.text)) {
        console.warn("[Memory Filter] Blocked sensitive data from memory storage:", trx.text);
        continue;
      }

      if (trx.action === "ADD") {
        const newMemory: Memory = {
          id: Math.random().toString(36).substring(2, 11),
          category: trx.category,
          text: trx.text,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        updatedMemories.push(newMemory);
      } else if (trx.action === "UPDATE") {
        const tarIndex = updatedMemories.findIndex(m => m.id === trx.id);
        if (tarIndex !== -1) {
          updatedMemories[tarIndex] = {
            ...updatedMemories[tarIndex],
            category: trx.category,
            text: trx.text,
            updatedAt: timestamp
          };
        } else {
          // Fallback, treat as ADD if ID not matched
          const newMemory: Memory = {
            id: Math.random().toString(36).substring(2, 11),
            category: trx.category,
            text: trx.text,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          updatedMemories.push(newMemory);
        }
      } else if (trx.action === "REMOVE") {
        updatedMemories = updatedMemories.filter(m => m.id !== trx.id);
      }
    }

    await saveMemories(updatedMemories);
    isConsolidating = false;
    return updatedMemories;

  } catch (error) {
    console.error("[Memory] Consolidation failure:", error);
    isConsolidating = false;
    return null;
  }
}

export async function extractMemoriesFromText(
  apiKey: string,
  sampleText?: string
): Promise<Memory[]> {
  const currentMemories = await loadMemories();
  if (!apiKey) return currentMemories;

  let dialogueHistory: { role: string; text: string }[] = [];
  if (sampleText && sampleText.trim()) {
    dialogueHistory = [{ role: "user", text: sampleText }];
  } else {
    return currentMemories;
  }

  const updated = await processConversationSlice(apiKey, dialogueHistory);
  return updated || currentMemories;
}

