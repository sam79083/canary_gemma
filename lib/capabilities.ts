// Client capability probe — tells us (and the user) exactly why a folder
// can't be picked: missing API, insecure context, or old Chrome. Rendered
// in the setup checklist so there's no more guessing.

export interface FolderCap {
  hasPicker: boolean;
  secure: boolean;
  chromeMajor: number | null;
  ua: string;
}

export function getFolderCap(): FolderCap {
  const hasPicker =
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function";
  const secure =
    typeof window !== "undefined" && window.isSecureContext === true;
  let chromeMajor: number | null = null;
  try {
    const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
    if (m) chromeMajor = parseInt(m[1], 10);
  } catch {
    // ignore
  }
  let ua = "";
  try {
    ua = navigator.userAgent;
  } catch {
    // ignore
  }
  return { hasPicker, secure, chromeMajor, ua };
}

/** One-line diagnosis for the checklist, e.g. "picker ✓ · https ✓ · Chrome 131". */
export function folderCapLine(cap: FolderCap): string {
  const picker = cap.hasPicker ? "picker ✓" : "picker ✗";
  const sec = cap.secure ? "https ✓" : "https ✗";
  const chrome = cap.chromeMajor !== null ? `Chrome ${cap.chromeMajor}` : "not Chrome";
  return `${picker} · ${sec} · ${chrome}`;
}
