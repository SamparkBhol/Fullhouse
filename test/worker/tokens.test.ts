import { describe, expect, it } from "vitest";
import {
  base64url,
  fromBase64url,
  newVenueId,
  ownerToken,
  ownerUrl,
  seal,
  timingSafeEqual,
  unseal,
  VENUE_ID_RE,
  verifyOwnerToken,
} from "../../src/worker/tokens.ts";

const SECRET = "a long test secret for hmac";

describe("owner tokens", () => {
  it("are stable for one venue and differ between venues", async () => {
    const a = await ownerToken(SECRET, "abcdefghijkm");
    expect(a).toBe(await ownerToken(SECRET, "abcdefghijkm"));
    expect(a).not.toBe(await ownerToken(SECRET, "abcdefghijkn"));
    expect(a).not.toBe(await ownerToken("another secret", "abcdefghijkm"));
  });

  it("are base64url with no padding and decode to a 32 byte HMAC", async () => {
    const t = await ownerToken(SECRET, "abcdefghijkm");
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64url(t)).toHaveLength(32);
  });

  it("verify only the exact token for that venue", async () => {
    const t = await ownerToken(SECRET, "abcdefghijkm");
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", t)).toBe(true);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkn", t)).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", `${t}x`)).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", t.slice(0, -1))).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", null)).toBe(false);
    expect(await verifyOwnerToken(SECRET, "abcdefghijkm", "x".repeat(500))).toBe(false);
  });

  it("build the owner link with the token after the hash so it never reaches a server log", async () => {
    expect(ownerUrl("https://x.example", "abcdefghijkm", "TOKEN")).toBe("https://x.example/v/abcdefghijkm#t=TOKEN");
  });
});

describe("helpers", () => {
  it("compare strings of different lengths as unequal", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("round trip base64url", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect([...fromBase64url(base64url(bytes))]).toEqual([...bytes]);
  });

  it("make venue ids from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(newVenueId()).toMatch(VENUE_ID_RE);
  });
});

describe("sealing the Eventbrite token", () => {
  it("round trips and never stores the plain token", async () => {
    const sealed = await seal(SECRET, "venue1", "EB_PRIVATE_TOKEN_123");
    expect(JSON.stringify(sealed)).not.toContain("EB_PRIVATE_TOKEN_123");
    expect(await unseal(SECRET, "venue1", sealed)).toBe("EB_PRIVATE_TOKEN_123");
  });

  it("fails for another venue or another secret", async () => {
    const sealed = await seal(SECRET, "venue1", "tok");
    await expect(unseal(SECRET, "venue2", sealed)).rejects.toThrow();
    await expect(unseal("other secret", "venue1", sealed)).rejects.toThrow();
  });

  it("uses a fresh IV each time", async () => {
    const a = await seal(SECRET, "venue1", "tok");
    const b = await seal(SECRET, "venue1", "tok");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});
