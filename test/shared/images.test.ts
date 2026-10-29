import { describe, expect, it } from "vitest";
import { proxiedImage, upstreamImage } from "../../src/shared/images.ts";

const COVER = "https://images.qloo.com/i/2575A4C0-5459-42E9-B119-FE7CFC8D558B-420x-auto.jpg";

describe("proxiedImage", () => {
  it("turns a Qloo image URL into a path on this site", () => {
    expect(proxiedImage(COVER)).toBe("/img/i/2575A4C0-5459-42E9-B119-FE7CFC8D558B-420x-auto.jpg");
  });

  it("keeps a query string Qloo put on the image", () => {
    expect(proxiedImage(`${COVER}?w=420&fit=crop`)).toBe("/img/i/2575A4C0-5459-42E9-B119-FE7CFC8D558B-420x-auto.jpg?w=420&fit=crop");
  });

  it("refuses every other host, scheme and port", () => {
    for (const url of [
      "https://images.example/i/a.jpg",
      "http://images.qloo.com/i/a.jpg",
      "https://images.qloo.com:8443/i/a.jpg",
      "https://images.qloo.com.evil.example/i/a.jpg",
      "https://evil.example/images.qloo.com/i/a.jpg",
      ["https://user", "images.qloo.com/i/a.jpg"].join("@"),
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/i/a.jpg",
      "",
    ]) {
      expect(proxiedImage(url), url).toBeNull();
    }
    expect(proxiedImage(undefined)).toBeNull();
  });

  it("refuses encoded characters, dot segments and odd query strings", () => {
    for (const url of [
      "https://images.qloo.com/i/%2e%2e/secret.jpg",
      "https://images.qloo.com/i/a%2Fb.jpg",
      "https://images.qloo.com/i/.hidden.jpg",
      "https://images.qloo.com/i//a.jpg",
      "https://images.qloo.com/",
      "https://images.qloo.com/i/a.jpg?next=https://evil.example",
      "https://images.qloo.com/i/a.jpg#frag",
    ]) {
      expect(proxiedImage(url), url).toBeNull();
    }
  });
});

describe("upstreamImage", () => {
  it("maps the site path back to images.qloo.com only", () => {
    expect(upstreamImage("/img/i/abc-420x-auto.jpg", "")).toBe("https://images.qloo.com/i/abc-420x-auto.jpg");
    expect(upstreamImage("/img/i/abc.jpg", "?w=420")).toBe("https://images.qloo.com/i/abc.jpg?w=420");
  });

  it("is the inverse of proxiedImage", () => {
    const path = proxiedImage(`${COVER}?w=420`) ?? "";
    const u = new URL(path, "https://fullhouse.example");
    expect(upstreamImage(u.pathname, u.search)).toBe(`${COVER}?w=420`);
  });

  it("refuses paths that try to leave the image host", () => {
    for (const [path, search] of [
      ["/img/", ""],
      ["/img//evil.example/a.jpg", ""],
      ["/img/@evil.example/a.jpg", ""],
      ["/img/i/..%2f..%2fapi", ""],
      ["/img/i/%2e%2e", ""],
      ["/img/i/a.jpg\\..\\b", ""],
      ["/img/i/a.jpg", "?u=https://evil.example"],
      ["/api/img/i/a.jpg", ""],
      ["/img/api/health", ""],
      ["/img/i/a.svg", ""],
      ["/img/i/a.html", ""],
      ["/img/x/a.jpg", ""],
      [`/img/${"a/".repeat(7)}a.jpg`, ""],
      [`/img/${"a".repeat(400)}.jpg`, ""],
    ] as const) {
      expect(upstreamImage(path, search), path + search).toBeNull();
    }
  });

  it("uses the origin it is given, for the local fake server", () => {
    expect(upstreamImage("/img/i/a.jpg", "", "http://127.0.0.1:4000")).toBe("http://127.0.0.1:4000/i/a.jpg");
  });
});
