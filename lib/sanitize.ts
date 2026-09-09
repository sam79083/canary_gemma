// Display-side safety net for chatty models.
//
// Some models narrate their compliance checklist ("* User asks: …",
// "* Is it short? Yes.") or think out loud in prose
// ("The user's question is an identity question. I must identify as ….
// So, I will answer in Korean: …") before the real answer despite
// instructions. sanitizeAnswer() removes that leading analysis plus
// accidental repeats and English translation asides.
// It NEVER touches code output or toolcall blocks — callers apply it only
// to final natural-language answers, after tool parsing.

/** True for CJK text (Korean/Japanese/Chinese) — the reply language. */
function hasCJK(s: string): boolean {
  return /[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/.test(s);
}

/**
 * A sentence that talks ABOUT the answer instead of being the answer:
 * third-person narration ("The user's question …"), self-planning
 * ("I must identify …", "So, I will answer …"), or echoes of the
 * reply-language instruction. Never matches normal first-person answers
 * like "I will help you …" — only meta planning verbs.
 */
function isMetaSentence(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // Third-person narration of the request = thinking, not answering.
  if (/the user'?s (question|prompt|request)/i.test(t)) return true;
  if (/\buser question\b/i.test(t)) return true;
  if (/\bidentity question\b/i.test(t)) return true;
  if (/for the .*response/i.test(t)) return true;
  if (/it is (still )?not natural/i.test(t)) return true;
  // Self-planning before answering.
  if (/\bi must identify\b/i.test(t)) return true;
  if (/\bi (must|should|need to) (answer|reply|respond)\b/i.test(t)) return true;
  if (/\bi will (answer|respond|reply)\b/i.test(t)) return true;
  if (/^so,?\s*i will\b/i.test(t)) return true;
  if (/asks me to reply/i.test(t)) return true;
  if (/(prompt|instruction) asks/i.test(t)) return true;
  // English-only echo of the reply-language instruction.
  if (/reply in (korean|english|japanese|chinese|spanish|french|german|portuguese|vietnamese|indonesian)/i.test(t) && !hasCJK(t))
    return true;
  // Compliance-checklist Q&A: "Is it short? Yes."
  if (/\?\s*(yes|no|네|아니요)\.?\s*$/i.test(t)) return true;
  // Quoted instruction fragments the model is "checking off".
  if (/system instruction|my system prompt|according to my system/i.test(t)) return true;
  return false;
}

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
  // Prose reasoning ("The user's question … is an identity question.").
  if (isMetaSentence(body)) return true;
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
  if (!raw) return raw;
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  // Code blocks stay untouched apart from repeat-collapsing.
  if (text.includes("```")) return dedupe(text);

  // "So, I will answer in Korean: "quoted answer" …" — the meta lead and the
  // answer share one line, so line-stripping can't see it. Cut the lead and
  // keep the quoted answer plus whatever follows it.
  const lead = text.match(/(?:so,?\s*)?i will answer[^:]{0,80}:\s*(["“])/i);
  if (lead && lead.index !== undefined) {
    const q = lead[1];
    const qPos = text.indexOf(q, lead.index);
    if (qPos >= 0) text = text.slice(qPos).trim();
  }

  const cutLines = text.split("\n");
  let i = 0;
  while (i < cutLines.length && (cutLines[i].trim() === "" || isMetaLine(cutLines[i]))) i++;
  text = cutLines.slice(i).join("\n").trim();
  if (!text) text = raw.replace(/\r\n/g, "\n").trim();

  // Glued boundaries from streaming ("…it.)저는…") — split CJK joints only,
  // so decimals/URLs like 3.14 stay intact.
  text = text
    .replace(/([.!?。！？)\]”"])(?=[가-힣])/g, "$1 ")
    .replace(/([가-힣])(?=["“‘(\[])/g, "$1 ");

  // Sentence-level: the whole first paragraph can be several English
  // reasoning sentences on one line. Drop leading meta sentences.
  // The boundary also splits after a closer (")", "]") so a translation
  // aside like "(I am …) Answer." becomes its own sentence.
  const parts = text.split(/(?<=[.!?。！？][)\]”"]?)\s+/);
  let j = 0;
  while (j < parts.length && isMetaSentence(parts[j])) j++;
  if (j > 0 && j < parts.length) {
    text = parts.slice(j).join(" ").trim();
  } else if (j === parts.length) {
    // Pure reasoning, no answer — let callers fall back to chDidntGet.
    return "";
  }

  // Unwrap the first quoted segment: `"저는 …입니다." (trans) 저는 …입니다.`
  // → `저는 …입니다. (trans) 저는 …입니다.` so the steps below can finish it.
  const quoted = text.match(/^["“]\s*([^"”]+?)\s*["”]([\s\S]*)$/);
  if (quoted) {
    const inner = quoted[1].trim();
    const rest = (quoted[2] || "").trim();
    text = rest ? `${inner} ${rest}`.trim() : inner;
  }

  // Standalone English parentheticals inside an otherwise CJK answer are
  // translation asides ("(I am …)"), not content the user asked for.
  if (hasCJK(text)) {
    const sents = text.split(/(?<=[.!?。！？][)\]”"]?)\s+/);
    const kept = sents.filter((s) => {
      const st = s.trim();
      if (/^\([^()]{0,200}\)\.?$/.test(st) && !hasCJK(st)) return false;
      return true;
    });
    if (kept.length > 0 && kept.length !== sents.length) text = kept.join(" ").trim();
  }

  text = text
    .replace(/^(response|answer)\s*:\s*/i, "")
    .replace(/^["“]+\s*/, "")
    .trim();
  if (!text) return "";
  return dedupe(text);
}
