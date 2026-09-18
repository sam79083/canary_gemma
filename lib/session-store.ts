import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage, SessionInfo } from "./types";
import {
  deleteAllDbSessions,
  deleteDbSession,
  listDbSessions,
  loadDbSession,
  saveDbSession,
} from "./db-sessions";
import {
  deleteLocalSession,
  listLocalSessions,
  loadLocalSession,
  saveLocalSession,
} from "./sessions-local";
import {
  deleteWorkspaceSession,
  listWorkspaceSessions,
  loadWorkspaceSession,
  saveWorkspaceSession,
} from "./sessions-workspace";

/**
 * One interface for all three session backends (Supabase / workspace
 * folder / browser localStorage). Callers pick the backend once via
 * getSessionStore() and stop repeating the useDb/workspace ternary at
 * every call site.
 */
export interface SessionStore {
  readonly kind: "db" | "workspace" | "local";
  list(): Promise<SessionInfo[]>;
  load(filename: string): Promise<ChatMessage[]>;
  save(
    title: string,
    messages: ChatMessage[],
    existing?: string | null,
  ): Promise<string>;
  remove(filename: string): Promise<void>;
  clearAll(): Promise<void>;
}

class DbSessionStore implements SessionStore {
  readonly kind = "db" as const;
  list(): Promise<SessionInfo[]> {
    return listDbSessions();
  }
  load(filename: string): Promise<ChatMessage[]> {
    return loadDbSession(filename);
  }
  save(
    title: string,
    messages: ChatMessage[],
    existing?: string | null,
  ): Promise<string> {
    // A leftover local filename is not a DB id — the route treats it
    // as "new" and creates a fresh cloud session instead of failing.
    return saveDbSession(existing ?? null, title, messages);
  }
  remove(filename: string): Promise<void> {
    return deleteDbSession(filename);
  }
  clearAll(): Promise<void> {
    return deleteAllDbSessions();
  }
}

class WorkspaceSessionStore implements SessionStore {
  readonly kind = "workspace" as const;
  constructor(private ws: WorkspaceApi) {}
  list(): Promise<SessionInfo[]> {
    return listWorkspaceSessions(this.ws);
  }
  load(filename: string): Promise<ChatMessage[]> {
    return loadWorkspaceSession(this.ws, filename);
  }
  save(
    title: string,
    messages: ChatMessage[],
    existing?: string | null,
  ): Promise<string> {
    return saveWorkspaceSession(this.ws, title, messages, existing);
  }
  remove(filename: string): Promise<void> {
    return deleteWorkspaceSession(this.ws, filename);
  }
  async clearAll(): Promise<void> {
    const list = await listWorkspaceSessions(this.ws).catch(() => []);
    for (const s of list) {
      try {
        await deleteWorkspaceSession(this.ws, s.filename);
      } catch {
        // keep deleting the rest
      }
    }
  }
}

class LocalSessionStore implements SessionStore {
  readonly kind = "local" as const;
  list(): Promise<SessionInfo[]> {
    return listLocalSessions();
  }
  load(filename: string): Promise<ChatMessage[]> {
    return loadLocalSession(filename);
  }
  save(
    title: string,
    messages: ChatMessage[],
    existing?: string | null,
  ): Promise<string> {
    return saveLocalSession(title, messages, existing);
  }
  remove(filename: string): Promise<void> {
    return deleteLocalSession(filename);
  }
  async clearAll(): Promise<void> {
    const list = await listLocalSessions().catch(() => []);
    for (const s of list) {
      try {
        await deleteLocalSession(s.filename);
      } catch {
        // keep deleting the rest
      }
    }
  }
}

/**
 * Backend selection (single place): members without a picked folder keep
 * chats in Supabase, a connected folder wins otherwise, everyone else
 * stays browser-local. Thin wrappers — safe to construct per render.
 */
export function getSessionStore(
  useDb: boolean,
  workspace: WorkspaceApi,
): SessionStore {
  if (useDb) return new DbSessionStore();
  if (workspace.connected) return new WorkspaceSessionStore(workspace);
  return new LocalSessionStore();
}
