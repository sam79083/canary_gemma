"use client";

import { useEffect, useState } from "react";
import {
  fmtNum,
  getLimits,
  getUsage,
  setLimits,
  type ModelLimits,
} from "@/lib/usage";
import type { TFn } from "@/lib/i18n";

function Bar({ frac }: { frac: number }) {
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div
      style={{
        flex: 1,
        height: 5,
        borderRadius: 3,
        background: "var(--border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 3,
          background: pct >= 90 ? "#c62828" : pct >= 70 ? "#e65100" : "#2e7d32",
        }}
      />
    </div>
  );
}

function Row({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
      <span style={{ flex: "0 0 86px", opacity: 0.8 }}>{label}</span>
      <Bar frac={limit > 0 ? used / limit : 0} />
      <span style={{ flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>
        {fmtNum(used)}/{fmtNum(limit)}
      </span>
    </div>
  );
}

/**
 * Per-model usage vs limits, measured on this device. Refreshes every few
 * seconds so it moves during/after replies. Limits are editable (they vary
 * per model — see AI Studio → rate limits).
 */
export default function UsageBlock({
  model,
  t,
}: {
  model: string;
  t: TFn;
}) {
  const [, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ModelLimits>(() => getLimits(model));

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setDraft(getLimits(model));
    setEditing(false);
  }, [model]);

  const u = getUsage(model);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t("usTitle")}</span>
        <button
          className="quota-refresh"
          title={t("usEdit")}
          onClick={() => {
            if (editing) {
              setLimits(model, draft);
              setEditing(false);
              setTick((x) => x + 1);
            } else {
              setDraft(getLimits(model));
              setEditing(true);
            }
          }}
        >
          {editing ? "✓" : "✎"}
        </button>
      </div>
      {editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          {(["rpm", "tpm", "rpd"] as const).map((k) => (
            <label
              key={k}
              style={{ flex: 1, fontSize: 10, opacity: 0.85, textTransform: "uppercase" }}
            >
              {k}
              <input
                type="number"
                min={1}
                value={draft[k]}
                onChange={(e) =>
                  setDraft({ ...draft, [k]: Number(e.target.value) })
                }
                style={{
                  width: "100%",
                  marginTop: 2,
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "4px 6px",
                  fontSize: 12,
                  background: "var(--input-bg)",
                  color: "var(--text)",
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <>
          <Row label={`RPD · ${t("usToday")}`} used={u.todayReqs} limit={u.limits.rpd} />
          <Row label="TPM" used={u.tpm} limit={u.limits.tpm} />
          <Row label="RPM" used={u.rpm} limit={u.limits.rpm} />
          <div style={{ fontSize: 10, opacity: 0.65 }}>
            {t("usToday")}: {fmtNum(u.todayTokens)} tok · {t("usNote")}
          </div>
        </>
      )}
    </div>
  );
}
