import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyUndo,
  canRestore,
  createMkdirEntry,
  createWriteEntry,
  snapshotForDelete,
  withTimestamp,
  type UndoApplyOps,
  type UndoEntry,
} from "../lib/undo.ts";

function memOps(seed: Record<string, string> = {}): {
  ops: UndoApplyOps;
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map(Object.entries(seed));
  const dirs = new Set<string>();
  const ops: UndoApplyOps = {
    write: async (p, c) => {
      files.set(p, c);
    },
    del: async (p) => {
      if (files.delete(p)) return;
      if ([...files.keys()].some((k) => k.startsWith(p + "/")) || dirs.has(p)) {
        for (const k of [...files.keys()]) {
          if (k.startsWith(p + "/")) files.delete(k);
        }
        dirs.delete(p);
        return;
      }
      throw new Error("Not found");
    },
    mkdir: async (p) => {
      dirs.add(p);
    },
  };
  return { ops, files, dirs };
}

const entry = (e: Omit<UndoEntry, "timestamp">): UndoEntry => withTimestamp(e);

describe("undo safety net", () => {
  it("write over an existing file restores the old text", async () => {
    const { ops, files } = memOps({ "a.txt": "old" });
    await applyUndo(entry(createWriteEntry("a.txt", "old", true)), ops);
    assert.equal(files.get("a.txt"), "old");
  });

  it("write of a brand-new file deletes it", async () => {
    const { ops, files } = memOps({ "a.txt": "new-bad" });
    await applyUndo(entry(createWriteEntry("a.txt", null, false)), ops);
    assert.equal(files.has("a.txt"), false);
  });

  it("mkdir removes the created directory", async () => {
    const { ops, dirs } = memOps();
    dirs.add("newdir");
    await applyUndo(entry(createMkdirEntry("newdir")), ops);
    assert.equal(dirs.has("newdir"), false);
  });

  it("delete restores the snapshotted text", async () => {
    const { ops, files } = memOps();
    await applyUndo(
      entry({ path: "a.txt", kind: "delete", existed: true, text: "orig" }),
      ops,
    );
    assert.equal(files.get("a.txt"), "orig");
  });

  it("delete without a backup refuses instead of writing partial data", async () => {
    const { ops } = memOps();
    const e = entry({ path: "bin.png", kind: "delete", existed: true, text: null, binary: true });
    assert.equal(canRestore(e), false);
    await assert.rejects(applyUndo(e, ops), /no-backup/);
  });

  it("canRestore guides the UI", () => {
    assert.equal(canRestore(entry(createWriteEntry("n.txt", null, false))), true);
    assert.equal(canRestore(entry(createMkdirEntry("d"))), true);
    assert.equal(canRestore(entry(createWriteEntry("a.txt", "old", true))), true);
    assert.equal(
      canRestore(entry({ path: "a.txt", kind: "delete", existed: true, text: null })),
      false,
    );
  });

  it("snapshotForDelete captures files and directories", async () => {
    const files = new Map([
      ["a.txt", "hello"],
      ["d/b.txt", "bee"],
    ]);
    const ops = {
      list: async (p: string) => {
        if (p === "d") return [{ name: "b.txt", kind: "file" }];
        throw new Error("Not a directory");
      },
      read: async (p: string) => {
        const v = files.get(p);
        if (v === undefined) throw new Error("Not a file");
        return v;
      },
    };
    const f = await snapshotForDelete(ops, "a.txt");
    assert.equal(f.kind, "delete");
    assert.equal(f.text, "hello");
    const d = await snapshotForDelete(ops, "d");
    assert.equal(d.isDir, true);
    assert.equal(d.dirFiles?.length, 1);
    assert.equal(d.dirFiles?.[0].text, "bee");
  });

  it("snapshotForDelete throws not-found when nothing exists", async () => {
    const ops = {
      list: async (_p: string): Promise<{ name: string; kind: string }[]> => {
        throw new Error("Not a directory");
      },
      read: async (_p: string): Promise<string> => {
        throw new Error("Not found");
      },
    };
    await assert.rejects(snapshotForDelete(ops, "ghost.txt"), /not-found/);
  });

  it("directory delete round-trips through applyUndo", async () => {
    const { ops, files } = memOps();
    const e = entry({
      path: "d",
      kind: "delete",
      existed: true,
      text: null,
      isDir: true,
      dirFiles: [{ path: "d/b.txt", text: "bee" }],
    });
    await applyUndo(e, ops);
    assert.equal(files.get("d/b.txt"), "bee");
  });
});
