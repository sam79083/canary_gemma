"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Folder, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import {
  deletePath as serverDeletePath,
  listFiles as serverListFiles,
  makeDir as serverMakeDir,
  readFile as serverReadFile,
  readFileBinary as serverReadBinary,
  writeFile as serverWriteFile,
} from "@/lib/api";
import {
  createMkdirEntry,
  createWriteEntry,
  snapshotForDelete,
  type UndoInput,
} from "@/lib/undo";
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
  showMenu: (m: MenuState, reload: () => void, trigger?: HTMLElement) => void;
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
            e.currentTarget as HTMLElement,
          );
        }}
      >
        <span
          className="arrow"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          ▸
        </span>
        <span className="icon">{open ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}</span>
        <span className="name">{entry.name}</span>
      </div>
      {!open ? null : (
        <div className="file-tree-children">
          {state === "loading" ? (
            <div className="loading-indicator" style={{ padding: "4px 8px" }}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
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
          e.currentTarget as HTMLElement,
        );
      }}
    >
      <span className="arrow-placeholder" />
      <span className="icon"><FileText size={14} aria-hidden="true" /></span>
      <span className="name">{entry.name}</span>
    </div>
  );
}

export default function FileTree({
  onOpenFile,
  version,
  onMutated,
  workspace,
  recordUndo,
  t,
}: {
  onOpenFile: (path: string) => void;
  version: number;
  onMutated: () => void;
  workspace: WorkspaceApi;
  /** Backup-before-write: every create/delete records its old state. */
  recordUndo: (e: UndoInput) => void;
  t: TFn;
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuReload = useRef<() => void>(() => {});
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const readText = useCallback(
    (p: string): Promise<string> =>
      localMode ? workspace.readFile(p) : serverReadFile(p),
    [localMode, workspace],
  );
  const readBin = useCallback(
    (p: string): Promise<Blob> =>
      localMode ? workspace.readBinary(p) : serverReadBinary(p),
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

  // Focus first menu item when menu opens.
  useEffect(() => {
    if (menu && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [menu]);

  // Return focus to trigger element when menu closes.
  useEffect(() => {
    if (!menu && menuTriggerRef.current) {
      menuTriggerRef.current.focus();
      menuTriggerRef.current = null;
    }
  }, [menu]);

  // Keyboard navigation for the context menu.
  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!menuRef.current) return;
    const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        items[currentIndex < items.length - 1 ? currentIndex + 1 : 0].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        items[currentIndex > 0 ? currentIndex - 1 : items.length - 1].focus();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (currentIndex >= 0) items[currentIndex].click();
        break;
      case "Escape":
        e.preventDefault();
        setMenu(null);
        break;
    }
  }, []);

  const showMenu = (m: MenuState, reload: () => void, trigger?: HTMLElement) => {
    if (trigger) menuTriggerRef.current = trigger;
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
            showMenu({ x: e.clientX, y: e.clientY, isDir: true, fullPath: "", parentPath: "" }, loadRoot, e.currentTarget as HTMLElement);
          }
        }}
      >
        {error ? (
          <div style={{ padding: 8, fontSize: 13 }}>{error}</div>
        ) : entries === null ? (
          <div className="loading-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state empty-state-compact">
            <div className="empty-state-hint" style={{ marginBottom: 4, fontSize: 14 }}>
              {t("trEmpty")}
            </div>
            <div className="empty-state-hint">{t("trEmptyHint")}</div>
          </div>
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
          ref={menuRef}
          role="menu"
          aria-label="File actions"
          className="context-menu"
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onMenuKeyDown}
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
                    // May overwrite an existing file of the same name —
                    // snapshot first so it stays revertable.
                    let oldText: string | null = null;
                    let existed = false;
                    try {
                      oldText = await readText(p);
                      existed = true;
                    } catch {
                      existed = false;
                    }
                    await createFile(p, "");
                    try {
                      recordUndo(createWriteEntry(p, oldText, existed));
                    } catch {
                      // recording must never break the op itself
                    }
                    try {
                      toast(t("trCreated"));
                    } catch {
                      // toasts are best-effort
                    }
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
                    const p = joinPath(menu.fullPath, fname);
                    await createDir(p);
                    try {
                      recordUndo(createMkdirEntry(p));
                    } catch {
                      // recording must never break the op itself
                    }
                    try {
                      toast(t("trCreated"));
                    } catch {
                      // toasts are best-effort
                    }
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
                  void navigator.clipboard.writeText(menu.fullPath).then(
                    () => {
                      try {
                        toast(t("shCopied"));
                      } catch {
                        // toasts are best-effort
                      }
                    },
                    () => {},
                  );
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
                  let backup = null;
                  try {
                    backup = await snapshotForDelete(
                      { list: loadEntries, read: readText, readBinary: readBin },
                      menu.fullPath,
                    );
                  } catch {
                    backup = null;
                  }
                  await removeEntry(menu.fullPath);
                  if (backup) {
                    try {
                      recordUndo(backup);
                    } catch {
                      // recording must never break the op itself
                    }
                  }
                  try {
                    toast(t("trDeleted"));
                  } catch {
                    // toasts are best-effort
                  }
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
      role="menuitem"
      tabIndex={0}
      className="context-menu-item"
      onClick={onClick}
    >
      {label}
    </div>
  );
}
