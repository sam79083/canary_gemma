// Agentic file tools for the on-device Gemma chat.
//
// The Chrome Prompt API (LanguageModel) has no native function-calling, so we
// do prompt-engineered tool use:
//   1. Chat builds a system-style prompt describing the tools + output format.
//   2. The model replies either with a ```toolcall JSON block (one tool per
//      turn) or with a final natural-language answer.
//   3. Chat executes the tool via the workspace (or server fallback), feeds
//      the result back as "TOOL RESULT", and re-prompts — up to MAX_STEPS.
// This lets "create/read/update/delete a file" work straight from chat, no
// separate "AI Edit" button needed.

export const AGENT_MAX_STEPS = 6;

export type ToolName =
  | "listFiles"
  | "readFile"
  | "writeFile"
  | "makeDir"
  | "deletePath";

export interface ToolCall {
  name: ToolName;
  path?: string;
  content?: string;
}

const VALID_TOOLS: ReadonlySet<string> = new Set([
  "listFiles",
  "list",
  "readFile",
  "read",
  "writeFile",
  "write",
  "createFile",
  "makeDir",
  "mkdir",
  "deletePath",
  "delete",
  "remove",
]);

function normalizeName(raw: string): ToolName | null {
  const n = raw.trim();
  if (n === "listFiles" || n === "list") return "listFiles";
  if (n === "readFile" || n === "read") return "readFile";
  if (n === "writeFile" || n === "write" || n === "createFile")
    return "writeFile";
  if (n === "makeDir" || n === "mkdir") return "makeDir";
  if (n === "deletePath" || n === "delete" || n === "remove")
    return "deletePath";
  return null;
}

/**
 * Parse a single tool call out of model output. Accepts:
 *   ```toolcall { "name": "readFile", "path": "notes/a.txt" } ```
 *   ```json { ... } ```
 *   <tool>{ ... }</tool>
 *   bare {"name":"readFile",...} on its own line
 * Returns null when the output is a final answer (no tool call).
 */
export function parseToolCall(text: string): ToolCall | null {
  if (!text) return null;
  const candidates: string[] = [];

  const fence = /```(?:toolcall|tool|json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    candidates.push(m[1].trim());
  }
  const tag = /<tool\s*>([\s\S]*?)<\/tool\s*>/gi;
  while ((m = tag.exec(text)) !== null) {
    candidates.push(m[1].trim());
  }
  // Bare JSON object containing a tool-ish key — only as last resort.
  const bare = text.match(/\{[\s\S]*?"(name|tool)"[\s\S]*?\}/);
  if (bare) candidates.push(bare[0]);

  for (const raw of candidates) {
    const cleaned = raw
      .trim()
      .replace(/^json\s*/i, "")
      .trim();
    if (!cleaned.startsWith("{")) continue;
    try {
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      const rawName =
        typeof obj.name === "string"
          ? obj.name
          : typeof obj.tool === "string"
            ? obj.tool
            : null;
      if (!rawName) continue;
      const name = normalizeName(rawName);
      if (!name) continue;
      const path =
        typeof obj.path === "string"
          ? obj.path
          : typeof obj.file === "string"
            ? obj.file
            : typeof obj.filename === "string"
              ? obj.filename
              : undefined;
      const content =
        typeof obj.content === "string"
          ? obj.content
          : typeof obj.text === "string"
            ? obj.text
            : typeof obj.data === "string"
              ? obj.data
              : undefined;
      return { name, path, content };
    } catch {
      // Not valid JSON — try next candidate.
    }
  }
  return null;
}

/** Strip toolcall fences so leftover JSON isn't shown as the final answer. */
export function stripToolCalls(text: string): string {
  return text
    .replace(/```(?:toolcall|tool|json)?\s*\n?[\s\S]*?```/gi, "")
    .replace(/<tool\s*>[\s\S]*?<\/tool\s*>/gi, "")
    .trim();
}

export function describeToolCall(tc: ToolCall): string {
  const p = tc.path ? ` ${tc.path}` : "";
  switch (tc.name) {
    case "listFiles":
      return `📂 list${p || " files"}`;
    case "readFile":
      return `📖 read${p}`;
    case "writeFile":
      return `✏️ write${p}`;
    case "makeDir":
      return `📁 mkdir${p}`;
    case "deletePath":
      return `🗑️ delete${p}`;
  }
}

/**
 * System-style preamble injected before the user's request on the first
 * agent step. Kept short — on-device models have small context windows and
 * follow simple formats best.
 */
export function buildAgentPreamble(rootListing: string | null): string {
  return (
    `You are a file assistant with workspace tools. ` +
    `Answer normal questions directly. ` +
    `When the user asks to create, read, update, list, or delete files/folders, ` +
    `use EXACTLY ONE tool per reply in this format and nothing else:\n` +
    `\`\`\`toolcall\n` +
    `{"name": "<listFiles|readFile|writeFile|makeDir|deletePath>", "path": "relative/path.txt", "content": "file text for writeFile only"}\n` +
    `\`\`\`\n` +
    `Rules:\n` +
    `- "path" is always relative to the workspace root, e.g. "notes/todo.txt". Never absolute, never "../".\n` +
    `- listFiles: "path" optional (omit or "" = root).\n` +
    `- readFile: needs "path". Read before editing an existing file.\n` +
    `- writeFile: needs "path" + "content". Creates parent folders as needed. Overwrites. "content" is the COMPLETE new file text with real newlines escaped as \\n.\n` +
    `- makeDir: needs "path".\n` +
    `- deletePath: needs "path". Deletes a file or folder.\n` +
    `- Output ONLY the toolcall block when acting — no explanation text around it.\n` +
    `- After the TOOL RESULT arrives, either call the next tool or answer the user in plain text (no toolcall).\n` +
    `- For "create file X with ...": writeFile X with the requested content, then confirm.\n` +
    (rootListing !== null
      ? `\nWorkspace root contains:\n${rootListing}\n`
      : `\nNo workspace is connected — tell the user to click "Set workspace" first.\n`)
  );
}

export function buildUserTurn(userText: string): string {
  return `User request: ${userText}`;
}

export function buildToolResultTurn(
  tc: ToolCall,
  ok: boolean,
  detail: string,
): string {
  const label = describeToolCall(tc);
  const body = detail.length > 4000 ? detail.slice(0, 4000) + "\n…(truncated)" : detail;
  return (
    `TOOL RESULT for ${label}: ${ok ? "OK" : "FAILED"}\n` +
    `${body}\n\n` +
    (ok
      ? `Continue: call the next tool if needed, otherwise reply to the user in plain text summarizing what you did.`
      : `The tool failed. Either retry with a fixed path/args (one toolcall) or explain the error to the user in plain text.`)
  );
}
