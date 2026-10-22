"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePersonalVocab } from "@/hooks/usePersonalVocab";
import type { PersonalVocab } from "@/lib/personal-vocab";

export default function PersonalVocabManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
const hookResult = usePersonalVocab(userId);
const { items, loading, add, update, remove } = hookResult;
const vocabItems = items as PersonalVocab[];
  const [editing, setEditing] = useState<PersonalVocab | null>(null);
  const [form, setForm] = useState({ term: "", meaning: "", example: "", tags: "", difficulty: 1 as 1|2|3, source: "manual" });

  const styles = {
    input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" as const },
    select: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" as const },
    btnPrimary: { padding: "8px 16px", borderRadius: 6, background: "var(--green)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 },
    btnSecondary: { padding: "8px 16px", borderRadius: 6, background: "var(--border)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 },
    btnDanger: { padding: "6px 10px", borderRadius: 6, background: "transparent", color: "#e03e3e", border: "1px solid #e03e3e", cursor: "pointer", fontSize: 12 },
    btnGhost: { padding: "6px 10px", borderRadius: 6, background: "transparent", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 },
  };

  const resetForm = () => setForm({ term: "", meaning: "", example: "", tags: "", difficulty: 1 as 1|2|3, source: "manual" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.term.trim() || !form.meaning.trim()) return;
    const payload = {
      term: form.term.trim(),
      meaning: form.meaning.trim(),
      example: form.example.trim() || undefined,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      difficulty: form.difficulty,
      source: form.source,
    };
    if (editing) await update(editing.id, payload);
    else await add(payload);
    resetForm();
    setEditing(null);
  };

  const startEdit = (v: PersonalVocab) => {
    setEditing(v);
    setForm({
      term: v.term,
      meaning: v.meaning,
      example: v.example ?? "",
      tags: v.tags.join(", "),
      difficulty: v.difficulty,
      source: v.source,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this word?")) return;
    await remove(id);
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", color: "var(--text)", borderRadius: 12, width: "100%", maxWidth: 720, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "spaceBetween", padding: 16, borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>📚 내 단어장</h2>
          <button onClick={onClose} style={{ padding: 8, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text)" }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12, background: "var(--bg)" }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="Term (e.g. ubiquitous)" style={styles.input} required />
            <input value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} placeholder="Meaning" style={styles.input} required />
          </div>
          <input value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} placeholder="Example sentence (optional)" style={styles.input} />
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma separated)" style={styles.input} />
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) as 1|2|3 })} style={styles.select}>
              <option value={1}>Easy</option>
              <option value={2}>Medium</option>
              <option value={3}>Hard</option>
            </select>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={styles.select}>
              <option value="manual">Manual</option>
              <option value="lesson">Lesson</option>
              <option value="reading">Reading</option>
              <option value="idiom">Idiom</option>
              <option value="career">Career</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { resetForm(); setEditing(null); onClose(); }} style={styles.btnSecondary}>Cancel</button>
            <button type="submit" style={styles.btnPrimary}>{editing ? "Update" : "Add"}</button>
          </div>
        </form>

        <div style={{ flex: 1, overflow: "auto", padding: 16, maxHeight: "50vh" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "var(--text)", opacity: 0.6, padding: 32 }}>Loading…</div>
          ) : vocabItems.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text)", opacity: 0.6, padding: 32 }}>No words yet. Add your first word above!</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {vocabItems.map((v: PersonalVocab) => (
                <li key={v.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{v.term}</span>
                      <span style={{ fontSize: 12, color: "var(--text)", opacity: 0.6 }}>({v.source})</span>
                      {v.tags.length > 0 && (
                        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {v.tags.map((t) => <span key={t} style={{ padding: "2px 6px", fontSize: 11, borderRadius: 4, background: "var(--blue-bg, #dbeafe)", color: "var(--blue-text, #1e40af)" }}>{t}</span>)}
                        </span>
                      )}
                      <span style={{ padding: "2px 6px", fontSize: 11, borderRadius: 4,
                        background: v.difficulty === 3 ? "var(--red-bg, #fee2e2)" : v.difficulty === 2 ? "var(--yellow-bg, #fef3c7)" : "var(--green-bg, #dcfce7)",
                        color: v.difficulty === 3 ? "var(--red-text, #991b1b)" : v.difficulty === 2 ? "var(--yellow-text, #92400e)" : "var(--green-text, #166534)"
                      }}>
                        {v.difficulty === 3 ? "Hard" : v.difficulty === 2 ? "Med" : "Easy"}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--text)", opacity: 0.8, margin: "4px 0 0" }}>{v.meaning}</p>
                    {v.example && <p style={{ fontSize: 13, color: "var(--text)", opacity: 0.6, margin: "4px 0 0", fontStyle: "italic" }}>"{v.example}"</p>}
                    <p style={{ fontSize: 11, color: "var(--text)", opacity: 0.5, margin: "4px 0 0" }}>Added {new Date(v.created_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => startEdit(v)} style={styles.btnGhost}>Edit</button>
                    <button onClick={() => handleDelete(v.id)} style={styles.btnDanger}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}