// Display-side safety net for chatty models.
//
// Some models narrate their compliance checklist ("* User asks: …",
// "* Is it short? Yes.") before the real answer despite instructions.
// sanitizeAnswer() removes that leading analysis plus accidental repeats.
// It NEVER touches code output or toolcall blocks — callers apply it only
// to final natural-language answers, after tool parsing.

/** A leading line that is clearly model-thinking, not user-facing text. */
function isMetaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // "Response:" / "Answer:" label prefix — handled by stripping, not dropping.
  if (/^(response|answer)\s*:\s*\S/i.test(t)) return false;
  // Bare analysis headers.
  if (/^(thinking|thought|analysis|reasoning|internal monologue)\s*:?$/i.test(t)) return true;
  // Parenthesized asides like "(Note: …".
  if (/^\((note|system|internal)/i.test(t)) return true;
  const bulleted = t.match(/^\s*[*•\-]\s+(.*)$/);
  const body = (bulleted ? bulleted[1] : t).trim();
  // Compliance-checklist Q&A: "* Is it short? Yes."
  if (/\?\s*(yes|no|네|아니요)\.?\s*$/i.test(body)) return true;
  // Echoes of the prompt structure.
  if (
    /^(user (asks|question|request|status|is asking)|system instruction|the user (is asking|asks|provided|question)|context\/constraints|constraints?|conditions?|instructions?|language constraint|language:|reply in |according to my system)/i.test(
      body,
    )
  )
    return true;
  // Quoted instruction fragments the model is "checking off".
  if (/system instruction|my system prompt/i.test(body)) return true;
  // Bare bullets that only restate the request, e.g. '* "gemma가 아니야?"'.
  if (bulleted && /^["'«“].*["'»”]\s*(\([^)]*\))?\s*$/.test(body)) return true;
  return false;
}

/** Drop consecutive duplicate sentences and exact-duplicated halves. */
function dedupe(text: string): string {
  // Whole-text doubled (answer printed twice back-to-back).
  const half = Math.floor(text.length / 2);
  if (half > 20 && text.slice(0, half).trim() === text.slice(half).trim()) {
    return text.slice(0, half).trim();
  }
  // Per line, so paragraph breaks and lists survive untouched.
  return text
    .split("\n")
    .map((line) => {
      const parts = line.split(/(?<=[.!?。！？])\s+/);
      const out: string[] = [];
      for (const p of parts) {
        if (out.length > 0 && out[out.length - 1].trim() === p.trim() && p.trim()) continue;
        out.push(p);
      }
      return out.join(" ");
    })
    .join("\n");
}

/** Clean a final model answer for display. Idempotent. */
export function sanitizeAnswer(raw: string): string {
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].trim() === "" || isMetaLine(lines[i]))) i++;
  let text = lines
    .slice(i)
    .join("\n")
    .replace(/^(response|answer)\s*:\s*/i, "")
    .trim();
  if (!text) text = raw.trim();
  return dedupe(text);
}
