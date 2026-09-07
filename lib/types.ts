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
