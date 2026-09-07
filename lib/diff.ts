/** Strip a single wrapping ``` fence (with optional language tag). */
export function stripCodeFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```[\w+-]*\s*\n([\s\S]*?)\s*```$/);
  if (m) return m[1].trim();
  return t
    .replace(/^```[\w+-]*\s*\n/, "")
    .replace(/\s*\n?```$/, "")
    .trim();
}

export interface DiffSummary {
  oldCount: number;
  newCount: number;
  removed: number;
  added: number;
  preview: string;
}

/** Factual line diff via common prefix/suffix trim; middle hunk = change. */
export function summarizeDiff(
  oldText: string,
  newText: string,
  maxPreview = 12,
): DiffSummary {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  )
    suffix++;
  const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
  const newMid = newLines.slice(prefix, newLines.length - suffix);
  const preview: string[] = [
    `--- lines ${prefix + 1}–${prefix + oldMid.length} removed (${oldMid.length}) / added (${newMid.length}) ---`,
  ];
  for (const l of oldMid.slice(0, maxPreview))
    preview.push("- " + (l.length > 160 ? l.slice(0, 160) + "…" : l));
  if (oldMid.length > maxPreview)
    preview.push(`… (${oldMid.length - maxPreview} more removed)`);
  for (const l of newMid.slice(0, maxPreview))
    preview.push("+ " + (l.length > 160 ? l.slice(0, 160) + "…" : l));
  if (newMid.length > maxPreview)
    preview.push(`… (${newMid.length - maxPreview} more added)`);
  if (oldMid.length === 0 && newMid.length === 0)
    preview.push("(no line changes — whitespace only?)");
  return {
    oldCount: oldLines.length,
    newCount: newLines.length,
    removed: oldMid.length,
    added: newMid.length,
    preview: preview.join("\n"),
  };
}
