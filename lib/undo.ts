// Revert safety net: every file mutation records enough to undo it,
// no matter which UI path performed it (chat agent, file editor, tree,
// uploads, drawings).
//
// Model: backup-before-write. Callers snapshot the old state BEFORE
// mutating, push the entry onto the shared stack (owned by page.tsx),
// and `applyUndo` inverts it later:
//   write (existed)    -> write old text back
//   write (new file)   -> delete the created path
//   mkdir              -> delete the created directory
//   delete (file)      -> re-create with old text/binary
//   delete (directory) -> re-create dir + all snapshotted files
//
// Text is the common case. Binary snapshots are best-effort base64
// (capped) so deleting a picture can still be undone. Anything too
// large or unreadable is recorded as unrestorable — undo then reports
// the limit instead of silently writing a partial file.

export interface UndoFileSnapshot {
  path: string;
  text: string | null;
  binaryBase64?: string | null;
  binaryMime?: string | null;
}

export type UndoKind = "write" | "delete" | "mkdir";

export interface UndoEntry {
  path: string;
  kind: UndoKind;
  /** False when the path did not exist before a write/mkdir. */
  existed: boolean;
  /** Old text for a single file. Null when new, binary, or unreadable. */
  text: string | null;
  /** True when a file existed but could not be read as text. */
  binary?: boolean;
  binaryBase64?: string | null;
  binaryMime?: string | null;
  /** Recursive snapshot for deleted directories (text-first). */
  dirFiles?: UndoFileSnapshot[];
  isDir?: boolean;
  /** True when the snapshot hit a cap and may be incomplete. */
  truncated?: boolean;
  /** True when the file was too large to keep a backup. */
  tooLarge?: boolean;
  timestamp: number;
}

export type UndoInput = Omit<UndoEntry, "timestamp">;

export const MAX_UNDO_ENTRIES = 20;
/** Keep backups in memory up to ~2MB per file; beyond that mark tooLarge. */
export const MAX_BACKUP_CHARS = 2_000_000;
/** localStorage budget per stack — larger entries stay memory-only. */
export const MAX_PERSIST_CHARS = 150_000;
export const MAX_DIR_FILES = 50;
export const MAX_DIR_BYTES = 1_000_000;
export const MAX_BINARY_BYTES = 2_000_000;

const UNDO_KEY = "canary-undo-stack";

export function withTimestamp(e: UndoInput): UndoEntry {
  return { ...e, timestamp: Date.now() };
}

/** "notes/todo.txt" -> "todo.txt". */
export function undoDisplayName(path: string): string {
  const parts = (path ?? "").split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path || "(root)";
}

export function createWriteEntry(
  path: string,
  oldText: string | null,
  existed: boolean,
): UndoInput {
  return { path, kind: "write", existed, text: oldText };
}

export function createMkdirEntry(path: string): UndoInput {
  return { path, kind: "mkdir", existed: false, text: null };
}

export interface SnapshotOps {
  list: (rel: string) => Promise<{ name: string; kind: string }[]>;
  read: (rel: string) => Promise<string>;
  /** Optional binary fallback (Blob for workspace, Blob for server). */
  readBinary?: (rel: string) => Promise<Blob>;
}

function joinChild(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

async function blobToBase64(blob: Blob): Promise<string> {
  // Node 18+ (tests) has no FileReader — use arrayBuffer instead.
  const buf = Buffer.from(await blob.arrayBuffer());
  return buf.toString("base64");
}

function isNotFound(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /not found|no such|does not exist|ENOENT|NotFound|Not a file|Not a directory|404/i.test(
    msg,
  );
}

/**
 * Snapshot `rel` BEFORE deleting it. Throws `not-found` when nothing
 * exists (caller should skip recording — the delete will fail anyway).
 */
export async function snapshotForDelete(
  ops: SnapshotOps,
  rel: string,
): Promise<UndoInput> {
  // 1. Plain text file — the common case.
  try {
    const text = await ops.read(rel);
    if (text.length > MAX_BACKUP_CHARS) {
      return {
        path: rel,
        kind: "delete",
        existed: true,
        text: null,
        binary: true,
        tooLarge: true,
      };
    }
    return { path: rel, kind: "delete", existed: true, text };
  } catch (readErr) {
    // 2. Maybe a directory? list() succeeds on dirs, fails on files.
    try {
      const top = await ops.list(rel);
      void top;
      return await snapshotDir(ops, rel);
    } catch (listErr) {
      // Neither readable nor listable. If the read failure was a clear
      // "not a file because it's binary", try the binary fallback before
      // giving up. Otherwise re-check: truly missing => nothing to record.
      const readMsg = readErr instanceof Error ? readErr.message : String(readErr);
      const looksBinary = /binary/i.test(readMsg);
      if (looksBinary && ops.readBinary) {
        try {
          const blob = await ops.readBinary(rel);
          if (blob.size > MAX_BINARY_BYTES) {
            return {
              path: rel,
              kind: "delete",
              existed: true,
              text: null,
              binary: true,
              tooLarge: true,
            };
          }
          const b64 = await blobToBase64(blob);
          return {
            path: rel,
            kind: "delete",
            existed: true,
            text: null,
            binary: true,
            binaryBase64: b64,
            binaryMime: blob.type || null,
          };
        } catch {
          // fall through to unrestorable record below
        }
      }
      if (isNotFound(readErr) && isNotFound(listErr)) {
        throw new Error("not-found");
      }
      // Exists but unreadable (permissions, binary without fallback…).
      // Record it so undo can at least explain instead of pretending.
      return {
        path: rel,
        kind: "delete",
        existed: true,
        text: null,
        binary: true,
      };
    }
  }
}

async function snapshotDir(
  ops: SnapshotOps,
  rel: string,
): Promise<UndoInput> {
  const files: UndoFileSnapshot[] = [];
  const queue: string[] = [rel];
  let bytes = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (files.length >= MAX_DIR_FILES) {
      truncated = true;
      break;
    }
    const cur = queue.shift() as string;
    let entries: { name: string; kind: string }[];
    try {
      entries = await ops.list(cur);
    } catch {
      truncated = true;
      break;
    }
    for (const e of entries) {
      const child = joinChild(cur, e.name);
      if (e.kind === "directory") {
        queue.push(child);
        continue;
      }
      if (files.length >= MAX_DIR_FILES || bytes >= MAX_DIR_BYTES) {
        truncated = true;
        break;
      }
      try {
        const text = await ops.read(child);
        if (bytes + text.length > MAX_DIR_BYTES) {
          truncated = true;
          break;
        }
        bytes += text.length;
        files.push({ path: child, text });
      } catch {
        // Binary or unreadable inside a deleted dir: try binary once,
        // else record a null placeholder so restore can warn.
        try {
          if (ops.readBinary) {
            const blob = await ops.readBinary(child);
            if (blob.size > MAX_BINARY_BYTES || bytes + blob.size > MAX_DIR_BYTES) {
              truncated = true;
              files.push({ path: child, text: null });
              continue;
            }
            bytes += blob.size;
            files.push({
              path: child,
              text: null,
              binaryBase64: await blobToBase64(blob),
              binaryMime: blob.type || null,
            });
          } else {
            files.push({ path: child, text: null });
          }
        } catch {
          files.push({ path: child, text: null });
        }
      }
    }
    if (truncated) break;
  }

  return {
    path: rel,
    kind: "delete",
    existed: true,
    text: null,
    isDir: true,
    dirFiles: files,
    ...(truncated ? { truncated: true } : {}),
  };
}

export interface UndoApplyOps {
  read?: (p: string) => Promise<string>;
  write: (p: string, content: string) => Promise<void>;
  del: (p: string) => Promise<void>;
  mkdir: (p: string) => Promise<void>;
  /** Restore binary snapshots (base64). Absent => binary restore fails. */
  writeBinary?: (p: string, base64: string) => Promise<void>;
}

/**
 * Invert one entry. Throws `no-backup` when the old contents were never
 * captured (too large / unreadable) and `binary-no-writer` when a binary
 * restore has no writer for the active backend.
 */
export async function applyUndo(
  entry: UndoEntry,
  ops: UndoApplyOps,
): Promise<void> {
  switch (entry.kind) {
    case "write": {
      if (entry.existed && entry.text !== null) {
        await ops.write(entry.path, entry.text);
        return;
      }
      // New file (or unwritable backup shape): remove what was created.
      // Already gone => treat as undone.
      try {
        await ops.del(entry.path);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
      if (entry.existed && entry.text === null) {
        // Existed but we have no backup (binary/tooLarge): the delete
        // above would destroy data — it already happened at write time,
        // so warn loudly instead of pretending success.
        throw new Error("no-backup");
      }
      return;
    }
    case "mkdir": {
      try {
        await ops.del(entry.path);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
      return;
    }
    case "delete": {
      if (entry.isDir) {
        await ops.mkdir(entry.path);
        for (const f of entry.dirFiles ?? []) {
          if (f.text !== null) {
            await ops.write(f.path, f.text);
          } else if (f.binaryBase64) {
            if (!ops.writeBinary) throw new Error("binary-no-writer");
            await ops.writeBinary(f.path, f.binaryBase64);
          } else {
            throw new Error("no-backup");
          }
        }
        return;
      }
      if (entry.text !== null) {
        await ops.write(entry.path, entry.text);
        return;
      }
      if (entry.binaryBase64) {
        if (!ops.writeBinary) throw new Error("binary-no-writer");
        await ops.writeBinary(entry.path, entry.binaryBase64);
        return;
      }
      throw new Error("no-backup");
    }
  }
}

/** False when we know in advance undo cannot restore the bytes. */
export function canRestore(entry: UndoEntry): boolean {
  if (entry.kind === "write") {
    // New file => delete works. Existing file needs its old text.
    // (binary/tooLarge writes already destroyed the original.)
    if (!entry.existed) return true;
    return entry.text !== null;
  }
  if (entry.kind === "mkdir") return true;
  if (entry.isDir) {
    const files = entry.dirFiles ?? [];
    return files.length > 0 && files.every((f) => f.text !== null || !!f.binaryBase64);
  }
  return entry.text !== null || !!entry.binaryBase64;
}

// ---- persistence (best-effort; memory-only when storage is missing) ----

function entryPersistSize(e: UndoEntry): number {
  let n = (e.text ?? "").length + (e.binaryBase64 ?? "").length;
  for (const f of e.dirFiles ?? []) {
    n += (f.text ?? "").length + (f.binaryBase64 ?? "").length;
  }
  return n;
}

function isValidEntry(e: unknown): e is UndoEntry {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.path === "string" &&
    (o.kind === "write" || o.kind === "delete" || o.kind === "mkdir") &&
    (typeof o.text === "string" || o.text === null) &&
    typeof o.existed === "boolean" &&
    typeof o.timestamp === "number"
  );
}

export function loadUndoStack(): UndoEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(UNDO_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidEntry).slice(-MAX_UNDO_ENTRIES);
  } catch {
    return [];
  }
}

export function saveUndoStack(entries: UndoEntry[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    // Drop oversized/binary entries rather than persisting a truncated
    // backup that would restore corrupt data.
    let budget = MAX_PERSIST_CHARS;
    const keep: UndoEntry[] = [];
    for (let i = entries.length - 1; i >= 0 && keep.length < MAX_UNDO_ENTRIES; i--) {
      const e = entries[i];
      const size = entryPersistSize(e);
      if (size > budget && keep.length > 0) continue;
      if (size > MAX_PERSIST_CHARS) continue;
      budget -= size;
      keep.unshift(e);
    }
    localStorage.setItem(UNDO_KEY, JSON.stringify(keep));
  } catch {
    // quota or privacy mode — stack stays memory-only
  }
}
