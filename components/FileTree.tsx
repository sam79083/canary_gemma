"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePath,
  listFiles,
  makeDir,
  writeFile,
} from "@/lib/api";
import type { FileEntry } from "@/lib/types";

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
}

function FolderNode({ entry, fullPath, parentPath, onOpenFile, showMenu }: NodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty">("idle");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const entries = await listFiles(fullPath);
      setChildren(entries);
      setState(entries.length === 0 ? "empty" : "idle");
    } catch (e) {
      console.error("Failed to load subdirectory:", e);
      setState("error");
    }
  }, [fullPath]);

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
            <div style={{ padding: "4px 8px", fontSize: 12 }}>Loading…</div>
          ) : state === "error" ? (
            <div style={{ padding: "4px 8px", fontSize: 12 }}>Failed to load</div>
          ) : state === "empty" ? (
            <div style={{ padding: "4px 8px", fontSize: 12 }}>(empty)</div>
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
                />
              ) : (
                <FileNode
                  key={child.name}
                  entry={child}
                  fullPath={childPath}
                  parentPath={fullPath}
                  onOpenFile={onOpenFile}
                  showMenu={showMenu}
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
}: {
  onOpenFile: (path: string) => void;
  version: number;
  onMutated: () => void;
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuReload = useRef<() => void>(() => {});

  const loadRoot = useCallback(async () => {
    try {
      setEntries(await listFiles(""));
      setError(null);
    } catch (e) {
      console.error("Failed to load files:", e);
      setError("Failed to load files");
    }
  }, []);

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
    await fn();
  };

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
          <div style={{ padding: 8, fontSize: 13 }}>Loading…</div>
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
              />
            ) : (
              <FileNode
                key={entry.name}
                entry={entry}
                fullPath={fullPath}
                parentPath=""
                onOpenFile={onOpenFile}
                showMenu={showMenu}
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
                label="📄 New File"
                onClick={() =>
                  runAction(async () => {
                    const fname = prompt("File name:");
                    if (!fname) return;
                    const p = joinPath(menu.fullPath, fname);
                    await writeFile(p, "");
                    refreshAfter();
                    onOpenFile(p);
                  })
                }
              />
              <MenuItem
                label="📁 New Folder"
                onClick={() =>
                  runAction(async () => {
                    const fname = prompt("Folder name:");
                    if (!fname) return;
                    await makeDir(joinPath(menu.fullPath, fname));
                    refreshAfter();
                  })
                }
              />
            </>
          ) : (
            <>
              <MenuItem label="✏️ Edit" onClick={() => { setMenu(null); onOpenFile(menu.fullPath); }} />
              <MenuItem
                label="📋 Copy Path"
                onClick={() => {
                  setMenu(null);
                  void navigator.clipboard.writeText(menu.fullPath);
                }}
              />
            </>
          )}
          {menu.fullPath ? (
            <MenuItem
              label="🗑️ Delete"
              onClick={() =>
                runAction(async () => {
                  const name = menu.fullPath.split("/").pop();
                  if (!confirm(`Delete ${name}?`)) return;
                  await deletePath(menu.fullPath);
                  refreshAfter();
                })
              }
            />
          ) : null}
          <MenuItem label="Cancel" onClick={() => setMenu(null)} />
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
