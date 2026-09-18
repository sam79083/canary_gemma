import { TRIAL_GEMINI_LIMIT } from "@/lib/trial-limits";
import type { TFn } from "@/lib/i18n";
import type { ToolCall } from "@/lib/agent";

export function cleanRelPath(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\0/g, "");
}

/** Short display name: "notes/todo.txt" -> "todo.txt". */
export function shortName(rel: string): string {
  const parts = rel.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : rel;
}

/** Turn a raw technical error into something a non-technical user can act on. */
export function friendlyError(t: TFn, e: unknown, path?: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/trial-over/i.test(raw)) return t("trOver", { n: TRIAL_GEMINI_LIMIT });
  const name = path ? shortName(path) : "";
  if (/not found|no such|does not exist|ENOENT|NotFound/i.test(raw))
    return t("chErrNotFound", { name });
  if (/permission|denied|not allowed|SecurityError|AbortError/i.test(raw))
    return t("chErrPerm", { name });
  if (/binary/i.test(raw)) return t("chErrBinary", { name });
  if (/server-bad-key/i.test(raw)) return t("stServerBadKey");
  if (/bad-key/i.test(raw)) return t("stCloudBadKey");
  if (/bad-model/i.test(raw)) return t("stCloudBadModel");
  if (/no-server-key/i.test(raw)) return t("stCloudNeedKey");
  if (/quota|limit|429/i.test(raw)) return t("chErrQuota");
  if (name) return t("chErrGeneric", { name });
  return t("chErrSomething");
}

/** Plain-language progress line for each file step (shown in chat). */
export function friendlyStep(t: TFn, tc: ToolCall, ok: boolean, detail: string): string {
  const path = cleanRelPath(tc.path);
  const name = shortName(path);
  const snippet = detail.length > 400 ? detail.slice(0, 400) + "…" : detail;
  if (ok) {
    switch (tc.name) {
      case "listFiles":
        return t("chMsgLooked", { p: path || "✓", detail: snippet });
      case "readFile":
        return t("chMsgOpened", { name, detail: snippet });
      case "writeFile":
        return t("chMsgSaved", { name });
      case "makeDir":
        return t("chMsgMkdir", { name });
      case "deletePath":
        return t("chMsgDeleted", { name });
    }
  }
  return t("chMsgFail", { detail: snippet });
}

/**
 * Actionable follow-up for a turn failure (error card). Null = the message
 * alone is enough (trial-over opens its own guide instead).
 */
export function errorHint(t: TFn, e: unknown, renewal?: string | null): string | null {
  const raw = e instanceof Error ? e.message : String(e);
  if (/trial-over/i.test(raw)) return null;
  if (/quota|limit|429/i.test(raw))
    return t("chHintQuota", { date: renewal || "?" });
  if (/bad-key|no-server-key|server-bad-key|bad-model/i.test(raw))
    return t("chHintKey");
  return null;
}

export function isUnsafePath(p: string): boolean {
  if (!p) return true;
  if (p === "." || p.startsWith("../") || p.includes("/../") || p.endsWith("/.."))
    return true;
  if (p.startsWith("/") || /^[a-zA-Z]:\//.test(p)) return true;
  return false;
}
