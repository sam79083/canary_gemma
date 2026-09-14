"use client";

import { useCallback, useState } from "react";

export interface ConfirmRequest {
  title: string;
  desc: string;
  okLabel: string;
  resolve: (ok: boolean) => void;
}

/**
 * Promise-based confirm dialog (accessible replacement for window.confirm).
 * Usage: `if (!(await confirm(t("ssDelete"), "", t("trDelete")))) return;`
 * Render <ConfirmDialog req={req} .../> once near the root.
 */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback(
    (title: string, desc = "", okLabel = "OK"): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setReq({ title, desc, okLabel, resolve });
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    setReq((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  return { confirm, req, settle };
}

export type ConfirmApi = ReturnType<typeof useConfirm>;
