export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Generated/uploaded picture shown with the message (live view only). */
  image?: { name: string; rel: string; url: string; prompt: string; engine: "hf" };
  /** Files written during this turn (live view only) — rendered as chips. */
  files?: { name: string; path: string }[];
}

export interface FileEntry {
  name: string;
  kind: "file" | "directory";
}

export interface SessionInfo {
  filename: string;
  title: string;
  timestamp: number;
}

/** A keyword hit inside a saved session's messages. */
export interface SessionHit {
  filename: string;
  title: string;
  snippet: string;
}

export interface SearchResult {
  source: string;
  title: string;
  snippet: string;
  url: string;
}

export interface QuotaInfo {
  plan_name?: string;
  searches_per_month?: number;
  plan_searches_left?: number;
  total_searches_left?: number;
  this_month_usage?: number;
  plan_renewal_date?: string;
  account_email?: string;
  account_status?: string;
  error?: string;
}

/** A file change waiting for the user's Keep/Undo decision. */
export interface PendingReview {
  kind: "write" | "delete";
  path: string;
  oldText: string;
  newText: string;
}

/** Keep = apply (possibly edited) text; Undo = discard. */
export interface ReviewResult {
  ok: boolean;
  /** Final content to write (write only; defaults to the proposal). */
  text: string;
  /** User's revision request — agent regenerates instead of ending. */
  feedback?: string;
  /** Save as a numbered copy (report-2.md) instead of overwriting. */
  saveAsNew?: boolean;
}

export type ReviewFn = (r: PendingReview) => Promise<ReviewResult>;

export interface DownloadFile {
  name: string;
  kind: string;
  mtimeMs?: number;
  size?: number;
}

export interface DownloadState {
  visible: boolean;
  files: DownloadFile[];
  loading: boolean;
}
