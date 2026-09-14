import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_COOKIE,
  checkCredentials,
  isAuthenticated,
  signToken,
  verifyToken,
} from "../lib/auth.ts";

const SAVED_ID = process.env.SAM_ID;
const SAVED_PW = process.env.SAM_PW;

function authedReq(token: string): Request {
  return new Request("https://example.com/api/x", {
    headers: { cookie: `${AUTH_COOKIE}=${encodeURIComponent(token)}` },
  });
}

describe("member auth", () => {
  beforeEach(() => {
    process.env.SAM_ID = "sam";
    process.env.SAM_PW = "1227";
  });

  afterEach(() => {
    if (SAVED_ID === undefined) delete process.env.SAM_ID;
    else process.env.SAM_ID = SAVED_ID;
    if (SAVED_PW === undefined) delete process.env.SAM_PW;
    else process.env.SAM_PW = SAVED_PW;
  });

  it("accepts the env credentials, rejects anything else", () => {
    assert.equal(checkCredentials("sam", "1227"), true);
    assert.equal(checkCredentials("sam", "wrong"), false);
    assert.equal(checkCredentials("someone", "1227"), false);
    assert.equal(checkCredentials("", ""), false);
    assert.equal(checkCredentials(" sam ", "1227"), true);
  });

  it("signs a token that verifies, tampered tokens fail", () => {
    const token = signToken("sam", "1227");
    assert.equal(verifyToken(token), true);
    assert.equal(verifyToken(token.slice(0, -1) + "0"), false);
    assert.equal(verifyToken(""), false);
    assert.equal(verifyToken(null), false);
    assert.equal(verifyToken(undefined), false);
  });

  it("authenticates requests carrying the cookie only", () => {
    assert.equal(isAuthenticated(authedReq(signToken("sam", "1227"))), true);
    assert.equal(
      isAuthenticated(new Request("https://example.com/api/x")),
      false,
    );
    assert.equal(isAuthenticated(authedReq("forged")), false);
  });

  it("rotates sessions when the env credentials change", () => {
    const before = signToken("sam", "1227");
    process.env.SAM_PW = "changed";
    assert.equal(isAuthenticated(authedReq(before)), false);
    assert.equal(isAuthenticated(authedReq(signToken("sam", "changed"))), true);
  });
});
