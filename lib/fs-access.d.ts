// Minimal File System Access API shapes.
// We use structural `any`-compatible types on purpose: TS DOM libs across
// versions disagree on these names, so we avoid clashing with built-ins.

export interface WorkspaceFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(content: string | Blob | ArrayBuffer | ArrayBufferView): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface WorkspaceDirHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<WorkspaceFileHandle | WorkspaceDirHandle>;
  getDirectoryHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<WorkspaceDirHandle>;
  getFileHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<WorkspaceFileHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  queryPermission?(opts?: { mode?: "read" | "readwrite" }): Promise<string>;
  requestPermission?(opts?: { mode?: "read" | "readwrite" }): Promise<string>;
}

declare global {
  interface Window {
    showDirectoryPicker?(opts?: {
      mode?: "read" | "readwrite";
    }): Promise<WorkspaceDirHandle>;
  }
}

export type { };
