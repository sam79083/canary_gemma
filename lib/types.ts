export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
}

export type ReviewFn = (r: PendingReview) => Promise<ReviewResult>;
