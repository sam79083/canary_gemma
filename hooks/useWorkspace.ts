"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceDirHandle } from "@/lib/fs-access";
import type { FileEntry } from "@/lib/types";

const BLOCKED = new Set([".next", "node_modules", ".git", ".turbo", ".canary"]);

function splitPath(rel: string): string[] {
  return (rel || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== "." && s !== "..");
}

export interface WorkspaceApi {
  supported: boolean;
  connected: boolean;
  rootName: string | null;
  error: string | null;
  pick: () => Promise<boolean>;
  disconnect: () => void;
  list: (rel: string) => Promise<FileEntry[]>;
  readFile: (rel: string) => Promise<string>;
  readBinary: (rel: string) => Promise<Blob>;
  writeFile: (rel: string, content: string) => Promise<void>;
  writeBinary: (rel: string, blob: Blob) => Promise<void>;
  makeDir: (rel: string) => Promise<void>;
  deletePath: (rel: string) => Promise<void>;
}

/**
 * Browser-local workspace via File System Access API (showDirectoryPicker).
 * Nothing is sent to the server — files live in a real folder on the user's PC.
 * The handle is kept in memory, so the user picks the folder each time the
 * browser/tab is (re)opened, exactly as requested for Render deployments.
 */
export function useWorkspace(): WorkspaceApi {
  // Mount-stable: SSR and first client render both see `false`, so the
  // server HTML matches. The real value is set once after mount — this
  // avoids React hydration mismatches (server has no `window`).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.showDirectoryPicker === "function",
    );
  }, []);
  const rootRef = useRef<WorkspaceDirHandle | null>(null);
  const [connected, setConnected] = useState(false);
  const [rootName, setRootName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensurePermission = useCallback(
    async (handle: WorkspaceDirHandle): Promise<boolean> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = handle as any;
        if (typeof h.queryPermission === "function") {
          const q = await h.queryPermission({ mode: "readwrite" });
          if (q === "granted") return true;
        }
        if (typeof h.requestPermission === "function") {
          const r = await h.requestPermission({ mode: "readwrite" });
          return r === "granted";
        }
        return true;
      } catch {
        return true;
      }
    },
    [],
  );

  const getDir = useCallback(
    async (rel: string, create = false): Promise<WorkspaceDirHandle> => {
      const root = rootRef.current;
      if (!root) throw new Error("No workspace selected");
      let dir = root;
      for (const part of splitPath(rel)) {
        dir = await dir.getDirectoryHandle(part, { create });
      }
      return dir;
    },
    [],
  );

  const getParentDir = useCallback(
    async (
      rel: string,
      create = false,
    ): Promise<{ dir: WorkspaceDirHandle; name: string }> => {
      const parts = splitPath(rel);
      const name = parts.pop();
      if (!name) throw new Error("Invalid path");
      const dir = await getDir(parts.join("/"), create);
      return { dir, name };
    },
    [getDir],
  );

  const pick = useCallback(async (): Promise<boolean> => {
    // Computed live from window — never from the `supported` state closure,
    // so handlers created on first paint (e.g. the onboarding guide) can't
    // go stale and wrongly report "can't pick".
    const showPicker =
      typeof window !== "undefined" ? window.showDirectoryPicker : undefined;
    if (typeof showPicker !== "function") {
      // Phones and some browsers can't pick folders at all — this is a
      // platform limit, not the wrong browser. Upload via 📎 instead.
      setError("This device can't pick folders — attach files with 📎 in the chat instead");
      return false;
    }
    try {
      setError(null);
      const handle = await showPicker({ mode: "readwrite" });
      const ok = await ensurePermission(handle);
      if (!ok) {
        setError("Workspace permission denied");
        return false;
      }
      rootRef.current = handle;
      setRootName(handle.name || "(workspace)");
      setConnected(true);
      return true;
    } catch (e) {
      // AbortError = user cancelled the picker — not an error.
      if (e instanceof DOMException && e.name === "AbortError") return false;
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [ensurePermission]);

  const disconnect = useCallback(() => {
    rootRef.current = null;
    setConnected(false);
    setRootName(null);
    setError(null);
  }, []);

  const list = useCallback(
    async (rel: string): Promise<FileEntry[]> => {
      const dir = await getDir(rel, false);
      const entries: FileEntry[] = [];
      for await (const handle of dir.values()) {
        if (BLOCKED.has(handle.name)) continue;
        if (handle.name.startsWith(".env")) continue;
        entries.push({
          name: handle.name,
          kind: handle.kind === "directory" ? "directory" : "file",
        });
      }
      entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return entries;
    },
    [getDir],
  );

  const readFile = useCallback(
    async (rel: string): Promise<string> => {
      const { dir, name } = await getParentDir(rel, false);
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      try {
        return await file.text();
      } catch {
        throw new Error("Binary file not supported");
      }
    },
    [getParentDir],
  );

  const readBinary = useCallback(
    async (rel: string): Promise<Blob> => {
      const { dir, name } = await getParentDir(rel, false);
      const fh = await dir.getFileHandle(name);
      return await fh.getFile();
    },
    [getParentDir],
  );

  const writeFile = useCallback(
    async (rel: string, content: string): Promise<void> => {
      const { dir, name } = await getParentDir(rel, true);
      const fh = await dir.getFileHandle(name, { create: true });
      const writable = await fh.createWritable();
      await writable.write(content ?? "");
      await writable.close();
    },
    [getParentDir],
  );

  const writeBinary = useCallback(
    async (rel: string, blob: Blob): Promise<void> => {
      const { dir, name } = await getParentDir(rel, true);
      const fh = await dir.getFileHandle(name, { create: true });
      const writable = await fh.createWritable();
      await writable.write(blob);
      await writable.close();
    },
    [getParentDir],
  );

  const makeDir = useCallback(
    async (rel: string): Promise<void> => {
      await getDir(rel, true);
    },
    [getDir],
  );

  const deletePath = useCallback(
    async (rel: string): Promise<void> => {
      const parts = splitPath(rel);
      if (parts.length === 0) throw new Error("Refusing to delete workspace root");
      const name = parts.pop() as string;
      const dir = await getDir(parts.join("/"), false);
      await dir.removeEntry(name, { recursive: true });
    },
    [getDir],
  );

  return {
    supported,
    connected,
    rootName,
    error,
    pick,
    disconnect,
    list,
    readFile,
    readBinary,
    writeFile,
    writeBinary,
    makeDir,
    deletePath,
  };
}
