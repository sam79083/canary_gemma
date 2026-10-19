import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TRIAL_FILE = path.join(os.tmpdir(), `canary-trial-test-${process.pid}.json`);
delete process.env.TRIAL_GLOBAL_PER_HOUR;

const { clientIp, globalRemaining, resetTrialState, trialPeek, trialUse } = await import(
  "../lib/trial.ts"
);

const req = (headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/api", { headers });

afterEach(() => {
  resetTrialState();
  try {
    fs.rmSync(process.env.TRIAL_FILE!, { force: true });
  } catch {
    // best-effort
  }
});

describe("trial ip extraction", () => {
  it("prefers proxy-set single-value headers", () => {
    assert.equal(clientIp(req({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
    assert.equal(clientIp(req({ "cf-connecting-ip": "8.8.8.8" })), "8.8.8.8");
  });

  it("takes the LAST x-forwarded-for hop (spoof-resistant)", () => {
    assert.equal(
      clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" })),
      "3.3.3.3",
    );
  });

  it("falls back to unknown", () => {
    assert.equal(clientIp(req()), "unknown");
  });
});

describe("trial budgets", () => {
  it("counts down per kind and blocks when exhausted", async () => {
    const r = req({ "x-real-ip": "5.5.5.5" });
    for (let i = 0; i < 10; i++) {
      const left = await trialUse(r, "gemini");
      assert.equal(left, 9 - i);
    }
    assert.equal(await trialUse(r, "gemini"), -1);
    // HF budget is separate and untouched.
    assert.equal(await trialUse(r, "hf"), 9);
  });

  it("peek does not consume", async () => {
    const r = req({ "x-real-ip": "6.6.6.6" });
    assert.deepEqual(await trialPeek(r), { gemini: 10, hf: 10 });
    await trialUse(r, "gemini");
    assert.deepEqual(await trialPeek(r), { gemini: 9, hf: 10 });
  });

  it("isolates budgets per ip", async () => {
    await trialUse(req({ "x-real-ip": "7.7.7.7" }), "gemini");
    assert.equal((await trialPeek(req({ "x-real-ip": "7.7.7.7" }))).gemini, 9);
    assert.equal((await trialPeek(req({ "x-real-ip": "8.8.8.8" }))).gemini, 10);
  });

  it("members bypass budgets", async () => {
    const r = req({ "x-real-ip": "5.5.5.5" });
    assert.equal(await trialUse(r, "gemini", true), 999999);
    assert.deepEqual(await trialPeek(r, true), { gemini: 999999, hf: 999999 });
  });

  it("tracks the global hourly valve", async () => {
    const before = globalRemaining();
    await trialUse(req({ "x-real-ip": "4.4.4.4" }), "gemini");
    assert.equal(globalRemaining(), before - 1);
  });
});
