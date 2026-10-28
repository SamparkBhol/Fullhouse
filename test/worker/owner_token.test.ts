import { describe, expect, it } from "vitest";
import { fromBase64url } from "../../src/worker/crypto.ts";
import { ownerToken, ownerUrl, timingSafeEqual, verifyOwnerToken } from "../../src/worker/owner_token.ts";

const SECRET = "a long test secret for hmac";
const NONCE = "venue nonce one";

describe("owner tokens", () => {
  it("are stable for one venue and differ between venues", async () => {
    const a = await ownerToken(SECRET, "abcdefghijkm", NONCE);
    expect(a).toBe(await ownerToken(SECRET, "abcdefghijkm", NONCE));
    expect(a).not.toBe(await ownerToken(SECRET, "abcdefghijkn", NONCE));
    expect(a).not.toBe(await ownerToken("another secret", "abcdefghijkm", NONCE));
  });

  it("are base64url with no padding and decode to a 32 byte HMAC", async () => {
    const t = await ownerToken(SECRET, "abcdefghijkm", NONCE);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64url(t)).toHaveLength(32);
  });

  it("verify only the exact token for that venue", async () => {
    const t = await ownerToken(SECRET, "abcdefghijkm", NONCE);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", NONCE, t)).toBe(true);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkn", NONCE, t)).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", NONCE, `${t}x`)).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", NONCE, t.slice(0, -1))).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", NONCE, null)).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", NONCE, "x".repeat(500))).toBe(false);
  });

  it("stop working once the venue's nonce changes, and keep the first link for venues made before nonces", async () => {
    const t = await ownerToken(SECRET, "abcdefghijkm", NONCE);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", "a new nonce", t)).toBe(false);
    const legacy = await ownerToken(SECRET, "abcdefghijkm");
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", "", legacy)).toBe(true);
    expect(legacy).not.toBe(t);
  });

  it("build the owner link with the token after the hash so it never reaches a server log", async () => {
    expect(ownerUrl("https://x.example", "abcdefghijkm", "TOKEN")).toBe("https://x.example/v/abcdefghijkm#t=TOKEN");
  });
});

describe("timingSafeEqual", () => {
  it("compare strings of different lengths as unequal", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

});
