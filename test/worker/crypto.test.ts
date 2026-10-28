import { describe, expect, it } from "vitest";
import { base64url, fromBase64url, seal, unseal } from "../../src/worker/crypto.ts";

const SECRET = "a long test secret for hmac";

describe("base64url", () => {
  it("round trip base64url", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect([...fromBase64url(base64url(bytes))]).toEqual([...bytes]);
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
