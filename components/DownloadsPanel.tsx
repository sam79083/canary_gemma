"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deletePath as serverDeletePath,
  listDownloads,
  triggerDownload,
} from "@/lib/api";
import type { DownloadFile } from "@/lib/types";
import type { TFn } from "@/lib/i18n";

/**
 * Server-temp downloads (workspace NOT connected).
 * Lists uploads/ via /api/downloads; ⬇️ streams via /api/download.
 */
export default function DownloadsPanel({
  version,
  onChanged,
  onOpenFile,
  t,
}: {
  version: number;
  onChanged: () => void;
  /** Open a temp file in the editor (path clicked by the user only). */
  onOpenFile: (path: string) => void;
  t: TFn;
}) {
  const [files, setFiles] = useState<DownloadFile[] | null>(null);

  const load = useCallback(async () => {
    try {
      setFiles(await listDownloads());
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await serverDeletePath(`uploads/${name}`);
        onChanged();
        void load();
      } catch (e) {
        alert(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
      }
    },
    [load, onChanged, t],
  );

  return (
    <div className="workspace-box" id="downloads-box" style={{ marginTop: 8 }}>
      <div className="workspace-name">{t("dlTitle")}</div>
      <div className="workspace-hint">{t("dlHint")}</div>
      {files === null ? (
        <div className="workspace-hint">{t("trLoading")}</div>
      ) : files.length === 0 ? (
        <div className="workspace-hint">{t("dlEmpty")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {files.map((f) => (
            <div
              key={f.name}
              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={f.name}
              >
                📄 {f.name}
              </span>
              <button
                className="sidebar-btn small"
                style={{ flex: "0 0 auto", width: "auto", padding: "2px 8px" }}
                title={t("trEdit")}
                onClick={() => onOpenFile(`uploads/${f.name}`)}
              >
                ✏️
              </button>
              <button
                className="sidebar-btn small"
                style={{ flex: "0 0 auto", width: "auto", padding: "2px 8px" }}
                title={f.name}
                onClick={() => triggerDownload(f.name)}
              >
                ⬇
              </button>
              <button
                className="sidebar-btn small"
                style={{ flex: "0 0 auto", width: "auto", padding: "2px 8px" }}
                title={t("trDelete")}
                onClick={() => void handleDelete(f.name)}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", marginTop: 6 }}>
        <button
          className="sidebar-btn small"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={() => void load()}
        >
          {t("dlRefresh")}
        </button>
      </div>
    </div>
  );
}
