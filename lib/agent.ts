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
 * Tool-call format both models must follow. Kept mechanical on purpose:
 * file paths, JSON shape, turn flow. No behavior lectures — those get
 * echoed back as deliberation. Two shapes: the full explicit one for the
 * tiny on-device model, and a short one for capable cloud/local models.
 */
export function buildAgentPreamble(
  rootListing: string | null,
  verbose = true,
): string {
  if (!verbose) {
    return (
      `To act on files, reply with EXACTLY ONE tool block and nothing else:\n` +
      `\`\`\`toolcall\n` +
      `{"name": "<listFiles|readFile|writeFile|makeDir|deletePath>", "path": "relative/path.txt", "content": "file text for writeFile only"}\n` +
      `\`\`\`\n` +
      `Paths are relative to the workspace root. writeFile takes the COMPLETE new file text. ` +
      `After a TOOL RESULT, either call the next tool or reply naturally. ` +
      `You cannot generate images.\n` +
      (rootListing !== null
        ? `\nWorkspace root contains:\n${rootListing}\n`
        : `\nNo workspace is connected.\n`)
    );
  }
  return (
    `To act on files, reply with EXACTLY ONE tool block and nothing else:\n` +
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
    `- When acting, output ONLY the toolcall block — no explanation text around it.\n` +
    `- After the TOOL RESULT arrives, either call the next tool or reply in plain text saying what you did.\n` +
    `- For "create file X with ...": writeFile X with the requested content, then confirm.\n` +
    `- You cannot generate images.\n` +
    (rootListing !== null
      ? `\nWorkspace root contains:\n${rootListing}\n`
      : `\nNo workspace is connected.\n`)
  );
}

export interface PlanStep {
  action: string;
  path?: string;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

/**
 * Ask for a file-task plan the user approves BEFORE anything runs.
 * One ```plan JSON block, no prose around it — parsePlan() reads it.
 */
export function buildPlanPrompt(
  rootListing: string | null,
  guidelines: string,
): string {
  return (
    `Draft an execution plan for the user's file request. Reply with EXACTLY ONE plan block and nothing else:\n` +
    `\`\`\`plan\n` +
    `{"goal": "one-line summary", "steps": [{"action": "what to do", "path": "relative/path.txt"}]}\n` +
    `\`\`\`\n` +
    `Rules:\n` +
    `- "path" is always relative to the workspace root, never absolute, never "../". Omit it for non-file steps.\n` +
    `- "action" is a short plain-language description a non-programmer understands (e.g. "Create the todos folder", NOT "mkdir").\n` +
    `- Keep it to 6 steps or fewer. Only steps this chat can do: list/read/write/mkdir/delete files.\n` +
    `- Do not run anything yet — planning only.\n` +
    (guidelines
      ? `\nUser guidelines (apply to the plan):\n${guidelines}\n`
      : ``) +
    (rootListing !== null
      ? `\nWorkspace root contains:\n${rootListing}\n`
      : `\nNo workspace is connected.\n`)
  );
}

/**
 * Parse the ```plan (or ```json) block from a plan reply. Null when the
 * model answered in prose instead — callers fall back to a retry hint.
 */
export function parsePlan(text: string): Plan | null {
  if (!text) return null;
  const fence = /```(?:plan|json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const raw = m[1].trim().replace(/^json\s*/i, "").trim();
    if (!raw.startsWith("{")) continue;
    try {
      const obj = JSON.parse(raw) as {
        goal?: unknown;
        steps?: unknown;
      };
      if (typeof obj.goal !== "string" || !obj.goal.trim()) continue;
      if (!Array.isArray(obj.steps)) continue;
      const steps: PlanStep[] = [];
      for (const s of obj.steps.slice(0, 12)) {
        if (!s || typeof s !== "object") continue;
        const action = (s as { action?: unknown }).action;
        if (typeof action !== "string" || !action.trim()) continue;
        const step: PlanStep = { action: action.trim().slice(0, 200) };
        const path = (s as { path?: unknown }).path;
        if (typeof path === "string" && path.trim())
          step.path = path.trim().slice(0, 200);
        steps.push(step);
      }
      if (steps.length === 0) continue;
      return { goal: obj.goal.trim().slice(0, 200), steps };
    } catch {
      // Not valid JSON — try next fence.
    }
  }
  return null;
}

/** One-line rendering of an approved plan for the agent's first turn. */
export function formatPlan(plan: Plan): string {
  const lines = plan.steps.map(
    (s, i) => `${i + 1}. ${s.action}${s.path ? ` (${s.path})` : ""}`,
  );
  return `Goal: ${plan.goal}\n${lines.join("\n")}`;
}

export function buildToolResultTurn(
  tc: ToolCall,
  ok: boolean,
  detail: string,
  declined = false,
  revision = false,
): string {
  const label = describeToolCall(tc);
  const body = detail.length > 4000 ? detail.slice(0, 4000) + "\n…(truncated)" : detail;
  if (revision) {
    // User asked for changes in review — nothing failed. Framed as
    // success deliberately: small models read "FAILED" as making an
    // error and apologize instead of regenerating.
    return (
      `TOOL RESULT for ${label}: CHANGES REQUESTED\n` +
      `${body}\n\n` +
      `Revise the content per the request above and call the tool again ` +
      `with the updated content. Do not apologize or explain — just do it.`
    );
  }
  if (declined) {
    // A user decline is final intent, not an error: never retry it or
    // "undo" around it — that loop is what made Drop look broken.
    return (
      `TOOL RESULT for ${label}: DECLINED BY USER\n` +
      `${body}\n\n` +
      `Do not retry this operation and do not attempt to undo it. ` +
      `Continue with the rest of the user's request, or reply naturally with what you did.`
    );
  }
  return (
    `TOOL RESULT for ${label}: ${ok ? "OK" : "FAILED"}\n` +
    `${body}\n\n` +
    (ok
      ? `Call the next tool if more steps remain. Otherwise reply naturally with what you did.`
      : `That failed. Fix the path or arguments and retry, or explain the error briefly.`)
  );
}
