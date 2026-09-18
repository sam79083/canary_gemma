"use client";

export default function CheckRow({ label, ok, bad }: { label: string; ok: boolean; bad: boolean }) {  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <span style={{ color: ok ? "#2e7d32" : bad ? "#c62828" : "#999", fontWeight: 700 }}>
        {ok ? "✓" : bad ? "✗" : "○"}
      </span>
      <span>{label}</span>
    </div>
  );
}
