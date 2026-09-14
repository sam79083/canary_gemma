"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ConfirmRequest } from "@/hooks/useConfirm";
import type { TFn } from "@/lib/i18n";

interface Props {
  req: ConfirmRequest | null;
  cancelLabel: string;
  onSettle: (ok: boolean) => void;
  t: TFn;
}

/** Accessible confirm modal driven by useConfirm(). */
export default function ConfirmDialog({ req, cancelLabel, onSettle, t }: Props) {
  return (
    <AlertDialog.Root
      open={req !== null}
      onOpenChange={(open) => {
        if (!open) onSettle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="review-overlay" />
        <AlertDialog.Content
          className="review-card"
          style={{ maxWidth: 360 }}
          aria-describedby={undefined}
        >
          <AlertDialog.Title asChild>
            <h3>{req?.title ?? ""}</h3>
          </AlertDialog.Title>
          {req?.desc ? (
            <AlertDialog.Description asChild>
              <div className="review-note">{req.desc}</div>
            </AlertDialog.Description>
          ) : (
            <AlertDialog.Description style={{ display: "none" }}>
              {req?.title ?? ""}
            </AlertDialog.Description>
          )}
          <div className="review-actions">
            <AlertDialog.Cancel asChild>
              <button
                className="editor-btn"
                onClick={() => onSettle(false)}
                autoFocus
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="editor-btn primary"
                onClick={() => onSettle(req !== null)}
              >
                {req?.okLabel ?? t("trDelete")}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
