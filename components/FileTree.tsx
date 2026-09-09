"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePath as serverDeletePath,
  listFiles as serverListFiles,
  makeDir as serverMakeDir,
  writeFile as serverWriteFile,
} from "@/lib/api";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { FileEntry } from "@/lib/types";
import type { TFn } from "@/lib/i18n";

interface MenuState {
  x: number;
  y: number;
  isDir: boolean;
  fullPath: string;
  parentPath: string;
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

interface NodeProps {
  entry: FileEntry;
  fullPath: string;
  parentPath: string;
  onOpenFile: (path: string) => void;
  showMenu: (m: MenuState, reload: () => void) => void;
  loadEntries: (path: string) => Promise<FileEntry[]>;
  t: TFn;
}

function FolderNode({ entry, fullPath, parentPath, onOpenFile, showMenu, loadEntries, t }: NodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty">("idle");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const entries = await loadEntries(fullPath);
      setChildren(entries);
      setState(entries.length === 0 ? "empty" : "idle");
    } catch (e) {
      console.error("Failed to load subdirectory:", e);
      setState("error");
    }
  }, [fullPath, loadEntries]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      void load();
    }
  };

  return (
    <div className="file-tree-folder">
      <div
        className="file-tree-item folder"
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          showMenu(
            { x: e.clientX, y: e.clientY, isDir: true, fullPath, parentPath },
            load,
          );
        }}
      >
        <span
          className="arrow"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          ▸
        </span>
        <span className="icon">{open ? "📂" : "📁"}</span>
        <span className="name">{entry.name}</span>
      </div>
      {!open ? null : (
        <div className="file-tree-children">
          {state === "loading" ? (
            <div style={{ padding: "4px 8px", fontSize: 12 }}>{t("trLoading")}</div>
          ) : state === "error" ? (
            <div style={{ padding: "4px 8px", fontSize: 12 }}>{t("trLoadFail")}</div>
          ) : state === "empty" ? (
            <div style={{ padding: "4px 8px", fontSize: 12 }}>{t("trEmpty")}</div>
          ) : (
            (children ?? []).map((child) => {
              const childPath = joinPath(fullPath, child.name);
              return child.kind === "directory" ? (
                <FolderNode
                  key={child.name}
                  entry={child}
                  fullPath={childPath}
                  parentPath={fullPath}
                  onOpenFile={onOpenFile}
                  showMenu={showMenu}
                  loadEntries={loadEntries}
                  t={t}
                />
              ) : (
                <FileNode
                  key={child.name}
                  entry={child}
                  fullPath={childPath}
                  parentPath={fullPath}
                  onOpenFile={onOpenFile}
                  showMenu={showMenu}
                  loadEntries={loadEntries}
                  t={t}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({ entry, fullPath, parentPath, onOpenFile, showMenu }: NodeProps) {
  return (
    <div
      className="file-tree-item"
      onClick={() => onOpenFile(fullPath)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showMenu(
          { x: e.clientX, y: e.clientY, isDir: false, fullPath, parentPath },
          () => {},
        );
      }}
    >
      <span className="arrow-placeholder" />
      <span className="icon">📄</span>
      <span className="name">{entry.name}</span>
    </div>
  );
}

export default function FileTree({
  onOpenFile,
  version,
  onMutated,
  workspace,
  t,
}: {
  onOpenFile: (path: string) => void;
  version: number;
  onMutated: () => void;
  workspace: WorkspaceApi;
  t: TFn;
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuReload = useRef<() => void>(() => {});

  // When the browser supports File System Access, the workspace is purely
  // local — Render never sees the files. Server API is only a fallback for
  // browsers without showDirectoryPicker (e.g. Firefox).
  const localMode = workspace.supported;
  const connected = workspace.connected;

  const loadEntries = useCallback(
    (p: string): Promise<FileEntry[]> =>
      localMode ? workspace.list(p) : serverListFiles(p),
    [localMode, workspace],
  );
  const createFile = useCallback(
    (p: string, content: string): Promise<void> =>
      localMode ? workspace.writeFile(p, content) : serverWriteFile(p, content),
    [localMode, workspace],
  );
  const createDir = useCallback(
    (p: string): Promise<void> =>
      localMode ? workspace.makeDir(p) : serverMakeDir(p),
    [localMode, workspace],
  );
  const removeEntry = useCallback(
    (p: string): Promise<void> =>
      localMode ? workspace.deletePath(p) : serverDeletePath(p),
    [localMode, workspace],
  );

  const loadRoot = useCallback(async () => {
    if (localMode && !connected) {
      setEntries([]);
      setError(null);
      return;
    }
    try {
      setEntries(await loadEntries(""));
      setError(null);
    } catch (e) {
      console.error("Failed to load files:", e);
      setError(t("trFilesFail"));
    }
  }, [loadEntries, localMode, connected, t]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot, version]);

  // Close context menu on any click
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const showMenu = (m: MenuState, reload: () => void) => {
    setMenu(m);
    menuReload.current = reload;
  };

  const refreshAfter = () => {
    menuReload.current();
    void loadRoot();
    onMutated();
  };

  const runAction = async (fn: () => Promise<void>) => {
    setMenu(null);
    try {
      await fn();
    } catch (e) {
      console.error("File action failed:", e);
      alert(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  if (localMode && !connected) {
    return (
      <div
        className="file-tree"
        style={{ flex: 1, minHeight: 150, padding: 12, fontSize: 13 }}
      >
        <div style={{ marginBottom: 8 }}>{t("trNoFolder")}</div>
        <div style={{ color: "var(--status-text)", fontSize: 12 }}>
          {t("trNoFolderHint")}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="file-tree"
        style={{ flex: 1, minHeight: 150 }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            e.stopPropagation();
            showMenu({ x: e.clientX, y: e.clientY, isDir: true, fullPath: "", parentPath: "" }, loadRoot);
          }
        }}
      >
        {error ? (
          <div style={{ padding: 8, fontSize: 13 }}>{error}</div>
        ) : entries === null ? (
          <div style={{ padding: 8, fontSize: 13 }}>{t("trLoading")}</div>
        ) : (
          entries.map((entry) => {
            const fullPath = entry.name;
            return entry.kind === "directory" ? (
              <FolderNode
                key={entry.name}
                entry={entry}
                fullPath={fullPath}
                parentPath=""
                onOpenFile={onOpenFile}
                showMenu={showMenu}
                loadEntries={loadEntries}
                t={t}
              />
            ) : (
              <FileNode
                key={entry.name}
                entry={entry}
                fullPath={fullPath}
                parentPath=""
                onOpenFile={onOpenFile}
                showMenu={showMenu}
                loadEntries={loadEntries}
                t={t}
              />
            );
          })
        )}
      </div>
      {menu ? (
        <div
          id="file-context-menu"
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            background: "var(--model-bar-bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 0",
            zIndex: 1000,
            minWidth: 160,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.isDir ? (
            <>
              <MenuItem
                label={t("trNewFile")}
                onClick={() =>
                  runAction(async () => {
                    const fname = prompt(t("trFileName"));
                    if (!fname) return;
                    const p = joinPath(menu.fullPath, fname);
                    await createFile(p, "");
                    refreshAfter();
                    onOpenFile(p);
                  })
                }
              />
              <MenuItem
                label={t("trNewFolder")}
                onClick={() =>
                  runAction(async () => {
                    const fname = prompt(t("trFolderName"));
                    if (!fname) return;
                    await createDir(joinPath(menu.fullPath, fname));
                    refreshAfter();
                  })
                }
              />
            </>
          ) : (
            <>
              <MenuItem label={t("trEdit")} onClick={() => { setMenu(null); onOpenFile(menu.fullPath); }} />
              <MenuItem
                label={t("trCopyPath")}
                onClick={() => {
                  setMenu(null);
                  void navigator.clipboard.writeText(menu.fullPath);
                }}
              />
            </>
          )}
          {menu.fullPath ? (
            <MenuItem
              label={t("trDelete")}
              onClick={() =>
                runAction(async () => {
                  const name = menu.fullPath.split("/").pop();
                  if (!confirm(t("trDelConfirm", { name: name ?? menu.fullPath }))) return;
                  await removeEntry(menu.fullPath);
                  refreshAfter();
                })
              }
            />
          ) : null}
          <MenuItem label={t("trCancel")} onClick={() => setMenu(null)} />
        </div>
      ) : null}
    </>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      onMouseOver={(e) => ((e.target as HTMLElement).style.background = "var(--border)")}
      onMouseOut={(e) => ((e.target as HTMLElement).style.background = "transparent")}
      style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
    >
      {label}
    </div>
  );
}
