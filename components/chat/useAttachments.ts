"use client";

import { useCallback, useState } from "react";
import {
  readFile as serverReadFile,
  writeFile as serverWriteFile,
} from "@/lib/api";
import { createWriteEntry, type UndoInput } from "@/lib/undo";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage } from "@/lib/types";
import type { TFn } from "@/lib/i18n";

export interface AttachedPhoto {
  name: string;
  mime: string;
  data: string;
}

const MAX_UPLOAD = 500 * 1024;
const MAX_PHOTO = 4 * 1024 * 1024;
const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Phone photos are 3–12MB; image tokens scale with pixels. Downscale to
 * max 1024px JPEG before sending — same understanding, ~10x fewer tokens.
 */
function downscalePhoto(f: File, maxDim = 1024, quality = 0.82): Promise<{ mime: string; data: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no-2d");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const out = canvas.toDataURL("image/jpeg", quality);
        const data = out.split(",").slice(1).join(",");
        if (!data) throw new Error("encode");
        resolve({ mime: "image/jpeg", data });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/**
 * 📎 attachment pipeline: photos go to the model (downscaled), text files
 * go to the workspace (or server temp uploads/ without a folder).
 */
export function useAttachments({
  workspace,
  pushMessage,
  persistChat,
  onFilesChanged,
  onOpenFile,
  recordUndo,
  focus,
  clearError,
  t,
}: {
  workspace: WorkspaceApi;
  pushMessage: (
    role: ChatMessage["role"],
    content: string,
    image?: ChatMessage["image"],
    files?: ChatMessage["files"],
  ) => void;
  persistChat: () => void;
  onFilesChanged: () => void;
  onOpenFile: (path: string) => void;
  recordUndo: (e: UndoInput) => void;
  focus: () => void;
  clearError: () => void;
  t: TFn;
}) {
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      clearError();
      for (const f of Array.from(files).slice(0, 5)) {
        // Photos go straight to the model (downscaled), not the workspace.
        // Match by MIME or extension — some phones report an empty MIME type.
        const looksLikePhoto =
          PHOTO_MIMES.includes(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
        if (looksLikePhoto) {
          if (f.size > MAX_PHOTO) {
            pushMessage("assistant", t("imgTooBig", { name: f.name }));
            continue;
          }
          try {
            const small = await downscalePhoto(f);
            setPhotos((prev) =>
              prev.length >= 3
                ? prev
                : [...prev, { name: f.name || "photo", ...small }],
            );
            pushMessage("assistant", t("imgAttached", { name: f.name || "photo" }));
          } catch {
            pushMessage("assistant", t("upBinary", { name: f.name }));
          }
          continue;
        }
        // No folder: text files go to the server temp (uploads/),
        // downloadable from the ⬇️ Downloads panel.
        const safeName =
          f.name.replace(/[\\/]/g, "_").replace(/^\.+/, "").slice(0, 100) ||
          "upload.txt";
        if (f.size > MAX_UPLOAD) {
          pushMessage("assistant", t("upTooBig", { name: f.name }));
          continue;
        }
        let text: string;
        try {
          text = await f.text();
        } catch {
          pushMessage("assistant", t("upBinary", { name: f.name }));
          continue;
        }
        if (text.includes("\0")) {
          pushMessage("assistant", t("upBinary", { name: f.name }));
          continue;
        }
        const rel = `uploads/${safeName}`;
        try {
          // Backup-before-write: an upload may overwrite an existing file.
          let oldText: string | null = null;
          let existed = false;
          try {
            oldText = workspace.connected
              ? await workspace.readFile(rel)
              : await serverReadFile(rel);
            existed = true;
          } catch {
            existed = false;
            oldText = null;
          }
          if (workspace.connected) {
            try {
              await workspace.makeDir("uploads");
            } catch {
              // exists already
            }
            await workspace.writeFile(rel, text);
          } else {
            await serverWriteFile(rel, text);
          }
          try {
            recordUndo(createWriteEntry(rel, oldText, existed));
          } catch {
            // recording must never break the upload itself
          }
          onFilesChanged();
          pushMessage("assistant", t("upUploaded", { name: rel }));
          onOpenFile(rel);
        } catch {
          pushMessage("assistant", t("upFailed"));
        }
      }
      persistChat();
      focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, pushMessage, persistChat, onFilesChanged, onOpenFile, t],
  );

  return { photos, setPhotos, handleFiles };
}
